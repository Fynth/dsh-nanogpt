/**
 * The `nanogpt` LLM adapter.
 *
 * One adapter instance owns one provider route. Every operation captures one
 * generation of configuration, preferences, and catalog state before its first
 * `await`, so a settings change or catalog refresh cannot combine one
 * generation's capabilities with another generation's endpoint mid-request.
 *
 * Chat runs through the three documented NanoGPT protocols; reasoning
 * capability is resolved per exact model (and per pinned route when one is
 * selected), and only the selected protocol's fields are serialized.
 *
 * @module dsh-nanogpt/adapter
 */
import {
  LlmAdapter,
  LlmError,
  ProviderRequestId,
  ReasoningEffortId,
  assertUsableApiKey,
  attributionHeaders,
  requestImageHandleText,
  type GenerateOptions,
  type LlmModelInfo,
  type LlmModelReasoningInfo,
  type LlmProviderInfo,
  type LlmResolvedModelInfo,
  type PreparedAdapterCall,
  type ResolvedRetryPolicy,
  type StreamChunk,
  type TokenUsage,
} from '@deepseek-ai/dsh-llm'
import type { AttachmentStore, FileAttachmentRef, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import {
  effectiveAdvanced,
  effectiveProtocol,
  effectiveRouting,
} from './protocols/common.js'
import { effortDescription, effortName, findModel, mergeModelOverrides } from './catalog.js'
import type { CatalogManager } from './catalog-store.js'
import { modelsEndpoint, type ResolvedConfig } from './config.js'
import { Diagnostics } from './diagnostics.js'
import type { DiscoveryDeps, ProviderDiscoveryOutcome } from './discovery.js'
import { fetchProviderCatalog } from './discovery.js'
import { httpFailure, requestIdFrom, transportFailure } from './errors.js'
import { readBodyBounded } from './http.js'
import { preferenceOverrides, type Preferences } from './preferences.js'
import { resolveReasoning, type ReasoningPolicy, type ReasoningOverride } from './reasoning.js'
import {
  PROVIDER,
  type CatalogModel,
  type CatalogSnapshot,
  type FailureInfo,
  type ProviderCatalog,
  type RequestDiagnostic,
  type WireEffort,
} from './shared.js'
import { prepareChatRequest } from './protocols/chat.js'
import { prepareResponsesRequest } from './protocols/responses.js'
import { prepareMessagesRequest } from './protocols/messages.js'
import { translateChatStream, type TranslationOptions } from './stream/chat.js'
import { translateResponsesStream } from './stream/responses.js'
import { translateMessagesStream } from './stream/messages.js'

/** Minimal logger surface. */
export interface AdapterLogger {
  info(message: string): void
  warn(message: string): void
}

/** Hooks and live readers the plugin supplies. */
export interface NanoGptAdapterOptions {
  /** Current validated connection facts; called once per operation. */
  config: () => ResolvedConfig
  /** Current catalog manager. */
  catalog: () => CatalogManager
  /** Current preferences document. */
  preferences: () => Preferences
  /** Resolve the credential named by a configuration snapshot. */
  resolveApiKey: (config: ResolvedConfig) => Promise<string | undefined>
  /** Resolve the optional attachment service at request time. */
  resolveAttachments?: () => AttachmentStore | undefined
  /** Resolve one durable file reference's model-facing handle text. */
  resolveFileText?: (ref: FileAttachmentRef) => string
  /** Logger. */
  logger: AdapterLogger
  /** Fetch implementation, injectable for tests. */
  fetch?: typeof fetch
  /** Attribution headers, injectable for tests. */
  attribution?: () => Record<string, string>
  /** Diagnostics buffer. */
  diagnostics?: Diagnostics
  /** Clock override, for tests. */
  now?: () => number
}

/** One captured configuration/catalog generation. */
interface Generation {
  config: ResolvedConfig
  preferences: Preferences
  snapshot: CatalogSnapshot | undefined
  models: CatalogModel[]
  byId: Map<string, CatalogModel>
  byAlias: Map<string, CatalogModel>
}

/** Cached provider-discovery answer. */
interface ProviderCacheEntry {
  catalog: ProviderCatalog
  at: number
}

/** Provider-discovery cache lifetime. */
const PROVIDER_CACHE_MS = 10 * 60_000
/** Per-image raw byte target passed to the attachment service. */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024
/** Aggregate base64 image budget per request, below NanoGPT's 32 MiB body cap. */
const IMAGE_TOTAL_BASE64_BUDGET = 24 * 1024 * 1024

/** One generation cache key. */
function generationKey(snapshot: CatalogSnapshot | undefined, preferences: Preferences, config: ResolvedConfig): string {
  return `${snapshot?.hash ?? 'none'}|${preferences.revision}|${JSON.stringify(config)}`
}

/** Build one captured generation. */
function captureGeneration(options: NanoGptAdapterOptions): Generation {
  const config = options.config()
  const preferences = options.preferences()
  const rawSnapshot = options.catalog().current()
  // A volatile baseURL edit must not keep serving a catalog fetched from the
  // previous endpoint. Treat the mismatch as an empty generation and ask the
  // manager to refresh; concurrent calls are deduplicated there.
  const snapshot = rawSnapshot !== undefined && rawSnapshot.endpoint === modelsEndpoint(config.baseURL)
    ? rawSnapshot
    : undefined
  if (rawSnapshot !== undefined && snapshot === undefined) void options.catalog().refresh('config')
  const overrides = [...config.models, ...preferenceOverrides(preferences)]
  const models = mergeModelOverrides(snapshot?.models ?? [], overrides)
  const byId = new Map<string, CatalogModel>(models.map((model) => [model.id, model]))
  const byAlias = new Map<string, CatalogModel>()
  for (const model of models) {
    for (const alias of model.aliases) byAlias.set(alias, model)
  }
  return { config, preferences, snapshot, models, byId, byAlias }
}

/** Resolve one model within a captured generation. */
function findGenerationModel(generation: Generation, id: string): CatalogModel | undefined {
  return generation.byId.get(id) ?? generation.byAlias.get(id)
}

/** Whether a request history contains a durable image block. */
function hasImageRequest(options: GenerateOptions): boolean {
  return options.messages.some((message) =>
    message.content.some((block) => block.type === 'image'),
  )
}

/** Build the DSH reasoning metadata for one policy. */
function reasoningInfo(policy: ReasoningPolicy | undefined): LlmModelReasoningInfo | undefined {
  if (policy === undefined) return undefined
  const efforts = policy.efforts.map((effort) => ({
    id: ReasoningEffortId(effort),
    name: effortName(effort),
    description: effortDescription(effort),
  }))
  // DSH rejects an advertised reasoning object with zero efforts. An unknown
  // ladder still needs a usable model, so advertise the adapter-owned Auto
  // level only: selecting it omits the wire effort and keeps the provider
  // default. The unknown/experimental facts stay in the settings model view.
  if (efforts.length === 0) {
    return {
      efforts: [
        {
          id: ReasoningEffortId('auto'),
          name: 'Auto (provider default)',
          description: 'The catalog does not disclose this model\'s effort ladder; only the provider default is advertised.',
        },
      ],
    }
  }
  if (policy.defaultEffort !== undefined) {
    efforts.unshift({
      id: ReasoningEffortId('auto'),
      name: 'Auto (provider default)',
      description: 'Omit the effort field and let the model/provider choose its documented default.',
    })
  }
  // Older DSH session headers may carry the legacy `off` spelling. Advertise it
  // only where a real disable selection exists; the wire mapper translates it to
  // `none`, so the literal string never reaches NanoGPT.
  const noneIndex = efforts.findIndex((effort) => String(effort.id) === 'none')
  if (policy.supportsDisable && noneIndex >= 0) {
    efforts.splice(noneIndex + 1, 0, {
      id: ReasoningEffortId('off'),
      name: 'Off (legacy alias for none)',
      description: 'Compatibility alias for none; the request sends reasoning_effort/thinking disabled, never the literal string "off".',
    })
  }
  return {
    efforts,
    ...policy.defaultEffort === undefined ? {} : { defaultEffort: ReasoningEffortId(policy.defaultEffort) },
  }
}

/** Build one model's override for reasoning resolution. */
function reasoningOverride(config: ResolvedConfig, preferences: Preferences, model: CatalogModel): ReasoningOverride | undefined {
  const modelPreference = preferences.models[model.id]
  const deployment = config.models.find((entry) => entry.id === model.id)
  if (modelPreference?.reasoningDisabled === true) return { disabled: true, source: 'user-config' }
  if (modelPreference?.reasoningEfforts !== undefined) {
    return { efforts: modelPreference.reasoningEfforts, source: 'user-config' }
  }
  if (deployment?.reasoningDisabled === true) return { disabled: true, source: 'user-config' }
  if (deployment?.reasoningEfforts !== undefined) {
    return { efforts: deployment.reasoningEfforts, source: 'user-config' }
  }
  return undefined
}

/** Convert one caught preparation failure into a classified LlmError. */
function preparationFailure(error: unknown): LlmError {
  if (error instanceof LlmError) return error
  const code = typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'INVALID_REQUEST'
  return new LlmError(error instanceof Error ? error.message : 'NanoGPT request could not be prepared', code, { cause: error })
}

/** The NanoGPT provider adapter. */
export class NanoGptAdapter extends LlmAdapter {
  private readonly options: NanoGptAdapterOptions
  private generationCache:
    | { key: string; generation: Generation }
    | undefined
  private readonly providerCache = new Map<string, ProviderCacheEntry>()
  private readonly providerInflight = new Map<string, Promise<ProviderDiscoveryOutcome>>()
  private readonly diagnostics: Diagnostics
  private readonly now: () => number

  /** @param options - live readers and request hooks. */
  constructor(options: NanoGptAdapterOptions) {
    super()
    this.options = options
    this.diagnostics = options.diagnostics ?? new Diagnostics()
    this.now = options.now ?? Date.now
  }

  /** Capture one generation, reusing the last one while its key is unchanged. */
  private capture(): Generation {
    const config = this.options.config()
    const preferences = this.options.preferences()
    const snapshot = this.options.catalog().current()
    const key = generationKey(snapshot, preferences, config)
    if (this.generationCache?.key === key) return this.generationCache.generation
    const generation = captureGeneration(this.options)
    this.generationCache = { key, generation }
    return generation
  }

  /** @returns this route's display metadata. */
  override providerInfo(provider: string): LlmProviderInfo {
    void provider
    return { id: PROVIDER, name: this.options.config().displayName }
  }

  /** @returns the registration-captured retry policy for this route. */
  override providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined {
    return this.options.config().retryPolicy
  }

  /** @returns the models this route advertises to selectors. */
  override async listModels(provider: string): Promise<readonly LlmModelInfo[]> {
    if (provider !== PROVIDER) return []
    const generation = this.capture()
    const hidden = new Set(generation.preferences.hidden)
    const disabled = new Set<string>()
    for (const entry of generation.config.models) {
      if (entry.enabled === false) disabled.add(entry.id)
    }
    for (const [id, preference] of Object.entries(generation.preferences.models)) {
      if (preference.enabled === false) disabled.add(id)
    }
    const pinned = new Set(generation.preferences.pinned)
    const favorites = new Set(generation.preferences.favorites)
    const visible = generation.models.filter(
      (model) => !hidden.has(model.id) && !disabled.has(model.id),
    )
    visible.sort((a, b) => {
      const rank = (model: CatalogModel): number => pinned.has(model.id) ? 0 : favorites.has(model.id) ? 1 : 2
      const rankDiff = rank(a) - rank(b)
      if (rankDiff !== 0) return rankDiff
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    return visible.map((model) => ({
      provider: PROVIDER,
      id: model.id,
      name: model.name,
      ...model.description === undefined ? {} : { description: model.description.slice(0, 500) },
      ...model.inputModalities === undefined ? {} : { inputModalities: [...model.inputModalities] },
    }))
  }

  /** Fetch or reuse one provider-discovery answer. */
  private async providerCatalog(
    config: ResolvedConfig,
    modelId: string,
    signal: AbortSignal | undefined,
  ): Promise<ProviderCatalog | undefined> {
    const key = `${config.origin}|${modelId}`
    const cached = this.providerCache.get(key)
    if (cached !== undefined && this.now() - cached.at < PROVIDER_CACHE_MS) return cached.catalog
    const inflight = this.providerInflight.get(key)
    if (inflight !== undefined) {
      const outcome = await inflight
      return outcome.status === 'ok' ? outcome.catalog : undefined
    }
    const deps: DiscoveryDeps = {
      ...this.options.fetch === undefined ? {} : { fetch: this.options.fetch },
      attribution: this.attribution(),
    }
    const attempt = (async (): Promise<ProviderDiscoveryOutcome> => {
      let apiKey: string | undefined
      try {
        apiKey = await this.options.resolveApiKey(config)
      } catch {
        apiKey = undefined
      }
      return fetchProviderCatalog(config.origin, modelId, deps, {
        ...apiKey === undefined ? {} : { apiKey },
        timeoutMs: config.requestTimeoutMs,
        ...signal === undefined ? {} : { signal },
      })
    })()
    this.providerInflight.set(key, attempt)
    try {
      const outcome = await attempt
      if (outcome.status === 'ok') {
        this.providerCache.set(key, { catalog: outcome.catalog, at: this.now() })
        while (this.providerCache.size > 200) {
          const oldest = this.providerCache.keys().next().value
          if (oldest === undefined) break
          this.providerCache.delete(oldest)
        }
      }
      return outcome.status === 'ok' ? outcome.catalog : undefined
    } finally {
      this.providerInflight.delete(key)
    }
  }

  /** Resolve one model's reasoning policy, including pinned-route facts. */
  private async policyFor(
    generation: Generation,
    model: CatalogModel,
    signal: AbortSignal | undefined,
    includeRoute = false,
  ): Promise<ReasoningPolicy | undefined> {
    const { config, preferences } = generation
    const routing = effectiveRouting(config, preferences, model)
    let route: { provider: string; efforts?: readonly WireEffort[]; alwaysThinking?: boolean } | undefined
    if (includeRoute && routing.mode === 'provider' && routing.provider !== undefined) {
      const providerCatalog = await this.providerCatalog(config, model.id, signal)
      const row = providerCatalog?.providers.find((entry) => entry.id === routing.provider)
      if (row !== undefined) {
        route = {
          provider: routing.provider,
          ...row.reasoningEfforts === undefined ? {} : { efforts: row.reasoningEfforts },
          ...row.reasoningAlwaysOn === undefined ? {} : { alwaysThinking: row.reasoningAlwaysOn },
        }
      }
    }
    const deployment = config.models.find((entry) => entry.id === model.id)
    const modelPreference = preferences.models[model.id]
    const modelDefault = modelPreference?.defaultEffort ?? deployment?.defaultEffort
    const configuredDefault =
      preferences.defaultReasoningEffort ?? config.defaultReasoningEffort
    return resolveReasoning({
      model,
      ...route === undefined
        ? {}
        : {
            route: {
              provider: route.provider,
              ...route.efforts === undefined ? {} : { efforts: route.efforts },
              ...route.alwaysThinking === undefined ? {} : { alwaysThinking: route.alwaysThinking },
            },
          },
      ...reasoningOverride(config, preferences, model) === undefined
        ? {}
        : { override: reasoningOverride(config, preferences, model) },
      ...configuredDefault === undefined ? {} : { configuredDefault },
      ...modelDefault === undefined ? {} : { modelDefault },
      experimental: config.experimentalEfforts || preferences.ui.experimental === true,
    })
  }

  /** Resolve one exact model's DSH metadata within a captured generation. */
  private async resolveWithin(
    generation: Generation,
    provider: string,
    modelId: string,
    signal: AbortSignal | undefined,
  ): Promise<LlmResolvedModelInfo> {
    if (provider !== PROVIDER) {
      throw new LlmError(`provider "${provider}" is not the NanoGPT route`, 'NO_ADAPTER')
    }
    const model = findGenerationModel(generation, modelId)
    if (model === undefined) {
      // Core routing accepts unlisted ids; keep the exact id and disclose no invented capability.
      return { provider: PROVIDER, id: modelId, name: modelId }
    }
    const policy = await this.policyFor(generation, model, signal)
    const advancedOverrides = {
      ...generation.config.advanced,
      ...generation.preferences.advanced,
      ...generation.config.models.find((entry) => entry.id === model.id)?.advanced,
      ...generation.preferences.models[model.id]?.advanced,
    }
    const defaultMaxTokens = advancedOverrides.maxTokens ?? generation.config.defaultMaxTokens
    return {
      provider: PROVIDER,
      // DSH requires the resolved id to equal the requested id. An alias is a
      // real accepted identity, so it must be echoed even though capability
      // metadata comes from the canonical catalog record.
      id: modelId,
      name: model.name,
      ...model.description === undefined ? {} : { description: model.description.slice(0, 500) },
      ...model.inputModalities === undefined ? {} : { inputModalities: [...model.inputModalities] },
      ...model.contextWindow === undefined ? {} : { context: { contextWindow: model.contextWindow } },
      ...defaultMaxTokens === undefined ? {} : { defaultMaxTokens },
      ...policy === undefined ? {} : { reasoning: reasoningInfo(policy) },
    }
  }

  /** @inheritdoc */
  override async resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo> {
    return this.resolveWithin(this.capture(), provider, model, signal)
  }

  /** @inheritdoc */
  override async prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall> {
    const generation = this.capture()
    const resolved = await this.resolveWithin(generation, provider, model, signal)
    let dispatched = false
    return {
      model: resolved,
      stream: (options: GenerateOptions): AsyncIterable<StreamChunk> => {
        if (dispatched) throw new LlmError('a prepared NanoGPT call can only be dispatched once', 'INVALID_PREPARED_CALL')
        dispatched = true
        return this.streamWithGeneration(options, generation)
      },
    }
  }

  /** @inheritdoc */
  override stream(options: GenerateOptions): AsyncIterable<StreamChunk> {
    return this.streamWithGeneration(options, this.capture())
  }

  /** Attribute every provider request to the harness. */
  private attribution(): Record<string, string> {
    try {
      return this.options.attribution?.() ?? attributionHeaders()
    } catch {
      return attributionHeaders()
    }
  }

  /** Resolve the request's credential, failing loud when the reference is unset. */
  private async credential(config: ResolvedConfig): Promise<string | undefined> {
    if (config.apiKeyEnv === undefined) return undefined
    const raw = await this.options.resolveApiKey(config)
    if (raw === undefined) {
      throw new LlmError(
        `no credential is configured for the NanoGPT reference "${String(config.apiKeyEnv)}"; add the key in Settings → NanoGPT or export the reference`,
        'MISSING_CREDENTIAL',
      )
    }
    return assertUsableApiKey(raw, 'llm-nanogpt', String(config.apiKeyEnv))
  }

  /**
   * Validate request features against a pinned upstream route. Provider
   * discovery can disclose smaller output budgets and missing tools/images/
   * caching for one route; sending the model-wide request anyway would either
   * fail at the provider or overstate capability in the preview.
   */
  private async validatePinnedRoute(
    generation: Generation,
    model: CatalogModel,
    options: GenerateOptions,
  ): Promise<void> {
    const { config, preferences } = generation
    const routing = effectiveRouting(config, preferences, model)
    if (routing.mode !== 'provider' || routing.provider === undefined) return
    const catalog = await this.providerCatalog(config, model.id, options.signal)
    if (catalog === undefined) return
    const row = catalog.providers.find((entry) => entry.id === routing.provider)
    if (row === undefined) {
      throw new LlmError(
        `provider "${routing.provider}" is not listed for model "${model.id}"; refresh provider discovery and choose a public id`,
        'UNSUPPORTED_OPTION',
      )
    }
    const advanced = effectiveAdvanced(config, preferences, model)
    const maxTokens = options.maxTokens ?? advanced.maxTokens ?? config.defaultMaxTokens
    if (row.maxOutputTokens !== undefined && maxTokens !== undefined && maxTokens > row.maxOutputTokens) {
      throw new LlmError(
        `provider "${routing.provider}" caps output at ${row.maxOutputTokens} tokens for "${model.id}", but this request asks for ${maxTokens}; lower maxTokens or unpin the provider`,
        'UNSUPPORTED_OPTION',
      )
    }
    if (row.supportsTools === false && (options.tools?.length ?? 0) > 0) {
      throw new LlmError(
        `provider "${routing.provider}" does not advertise tool calling for "${model.id}"; unpin the provider or send a request without tools`,
        'UNSUPPORTED_OPTION',
      )
    }
    if (row.supportsImages === false && hasImageRequest(options)) {
      throw new LlmError(
        `provider "${routing.provider}" does not advertise image input for "${model.id}"; remove the images or choose another route`,
        'UNSUPPORTED_OPTION',
      )
    }
    if (row.supportsPromptCaching === false && routing.caching === true) {
      throw new LlmError(
        `provider "${routing.provider}" does not advertise prompt caching for "${model.id}"; disable caching or choose another route`,
        'UNSUPPORTED_OPTION',
      )
    }
  }

  /** Build the protocol context for one request. */
  private async prepare(
    generation: Generation,
    options: GenerateOptions,
    preview = false,
  ): Promise<{ wire: import('./protocols/common.js').PreparedWireRequest }> {
    const model = findGenerationModel(generation, options.model)
    if (model === undefined) {
      throw new LlmError(
        `NanoGPT does not know model "${options.model}". Refresh the catalog or declare the exact id in Settings → NanoGPT.`,
        'UNKNOWN_MODEL',
      )
    }
    const policy = await this.policyFor(generation, model, options.signal, true)
    await this.validatePinnedRoute(generation, model, options)
    const protocol = effectiveProtocol(generation.config, generation.preferences, model)
    const apiKey = preview ? undefined : await this.credential(generation.config)
    const attachments = this.options.resolveAttachments?.()
    let imageBase64 = 0
    const baseHeaders: Record<string, string> = {
      ...this.attribution(),
      Accept: 'text/event-stream',
      ...preview
        ? { Authorization: 'Bearer <redacted>' }
        : apiKey === undefined ? {} : { Authorization: `Bearer ${apiKey}` },
    }
    const resolveImage = async (ref: ImageAttachmentRef, signal?: AbortSignal): Promise<import('./protocols/common.js').ResolvedImage | undefined> => {
      if (attachments === undefined) return undefined
      try {
        const stored = await attachments.readImageRequest(
          ref,
          { width: ref.width, height: ref.height, maxBytes: IMAGE_MAX_BYTES },
          signal,
        )
        const data = Buffer.from(stored.data).toString('base64')
        imageBase64 += data.length
        if (imageBase64 > IMAGE_TOTAL_BASE64_BUDGET) {
          throw new LlmError(
            `request images exceed the ${Math.round(IMAGE_TOTAL_BASE64_BUDGET / (1024 * 1024))} MiB inline budget; remove or offload some images`,
            'INVALID_REQUEST',
          )
        }
        const handle = requestImageHandleText(ref, stored)
        return { mediaType: stored.mediaType, data, handle }
      } catch (error) {
        if (error instanceof LlmError) throw error
        return undefined
      }
    }
    const context = {
      config: generation.config,
      preferences: generation.preferences,
      model,
      policy,
      selection: options.reasoningEffort === undefined ? undefined : (String(options.reasoningEffort) as import('./reasoning.js').EffortSelection),
      visibility: generation.preferences.reasoningVisibility ?? generation.config.reasoningVisibility,
      options,
      resolveFileText: (ref: FileAttachmentRef): string => {
        try {
          return this.options.resolveFileText?.(ref) ?? `[file ${ref.name}, ${ref.bytes} bytes]`
        } catch {
          return `[file ${ref.name}, ${ref.bytes} bytes]`
        }
      },
      resolveImage,
    }
    const wire =
      protocol === 'chat'
        ? await prepareChatRequest(context, baseHeaders)
        : protocol === 'responses'
          ? await prepareResponsesRequest(context, baseHeaders)
          : await prepareMessagesRequest(context, baseHeaders)
    return { wire }
  }

  /** Translate one stream and record a safe diagnostic. */
  private async *streamWithGeneration(options: GenerateOptions, generation: Generation): AsyncGenerator<StreamChunk> {
    if (options.provider !== PROVIDER) {
      throw new LlmError(`provider "${options.provider}" is not the NanoGPT route`, 'NO_ADAPTER')
    }
    const started = this.now()
    let wire: import('./protocols/common.js').PreparedWireRequest
    try {
      const prepared = await this.prepare(generation, options)
      wire = prepared.wire
    } catch (error) {
      const failure = preparationFailure(error)
      this.recordDiagnostic({
        at: new Date().toISOString(),
        provider: PROVIDER,
        model: options.model,
        protocol: effectiveProtocol(generation.config, generation.preferences, findGenerationModel(generation, options.model) ?? { id: options.model } as CatalogModel),
        ...options.reasoningEffort === undefined ? {} : { requestedEffort: String(options.reasoningEffort) },
        streamed: false,
        durationMs: this.now() - started,
        failure: {
          code: failure.code,
          message: failure.message,
          ...failure.failure.status === undefined ? {} : { status: failure.failure.status },
        },
      })
      throw failure
    }

    const controller = new AbortController()
    const onAbort = (): void => controller.abort(options.signal?.reason)
    if (options.signal !== undefined) {
      if (options.signal.aborted) controller.abort(options.signal.reason)
      else options.signal.addEventListener('abort', onAbort, { once: true })
    }
    const headersTimer = setTimeout(() => controller.abort(new Error('headers timed out')), generation.config.requestTimeoutMs)
    headersTimer.unref?.()
    let response: Response
    let headerMs: number | undefined
    try {
      response = await (this.options.fetch ?? fetch)(wire.url, {
        method: 'POST',
        headers: wire.headers,
        body: JSON.stringify(wire.body),
        redirect: 'error',
        signal: controller.signal,
      })
      headerMs = this.now() - started
    } catch (error) {
      clearTimeout(headersTimer)
      options.signal?.removeEventListener('abort', onAbort)
      const failure =
        controller.signal.aborted && options.signal?.aborted !== true
          ? new LlmError(`NanoGPT request headers timed out after ${generation.config.requestTimeoutMs} ms`, 'TIMEOUT', { cause: error })
          : transportFailure(error, options.signal)
      this.recordFailure(options, generation, wire, failure, started)
      throw failure
    } finally {
      clearTimeout(headersTimer)
    }
    const requestId = requestIdFrom(response.headers)
    if (!response.ok) {
      let body: unknown
      try {
        const text = await readBodyBounded(response, 256 * 1024)
        body = text.text.trim().length === 0 ? undefined : JSON.parse(text.text)
      } catch {
        body = undefined
      }
      const failure = httpFailure(response.status, body, response.headers, options.model)
      this.recordFailure(options, generation, wire, failure, started, headerMs, requestId)
      options.signal?.removeEventListener('abort', onAbort)
      throw failure
    }
    if (response.body === null) {
      const failure = new LlmError('NanoGPT returned an empty response body', 'MALFORMED_RESPONSE', {
        status: response.status,
      })
      this.recordFailure(options, generation, wire, failure, started, headerMs, requestId)
      options.signal?.removeEventListener('abort', onAbort)
      throw failure
    }
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase()
    if (contentType.includes('application/json') || contentType.includes('text/html')) {
      const failure = new LlmError(
        `NanoGPT returned ${contentType.split(';')[0].trim()} instead of an SSE stream; check the endpoint/protocol and whether the provider rejected the stream`,
        'MALFORMED_RESPONSE',
        { status: response.status },
      )
      this.recordFailure(options, generation, wire, failure, started, headerMs, requestId)
      options.signal?.removeEventListener('abort', onAbort)
      throw failure
    }
    const metrics: { usage?: TokenUsage; costUsd?: number } = {}
    const translation: TranslationOptions = {
      model: findGenerationModel(generation, options.model) ?? ({ id: options.model } as CatalogModel),
      ...options.signal === undefined ? {} : { signal: options.signal },
      idleTimeoutMs: generation.config.streamIdleTimeoutMs,
      ...requestId === undefined ? {} : { requestId },
      metrics,
    }
    let emitted = false
    try {
      const stream =
        wire.protocol === 'chat'
          ? translateChatStream(response.body, translation)
          : wire.protocol === 'responses'
            ? translateResponsesStream(response.body, translation)
            : translateMessagesStream(response.body, translation)
      for await (const chunk of stream) {
        emitted = true
        yield chunk
      }
    } catch (error) {
      let failure = preparationFailure(error)
      if (options.signal?.aborted === true) {
        failure = new LlmError('NanoGPT request was cancelled', 'ABORTED', { cause: error })
      } else if (/idle timeout/i.test(failure.message)) {
        // A silent stream after partial output is not safe to retry: the host
        // policy retries TIMEOUT, and a replay would duplicate paid work.
        failure = new LlmError(
          emitted
            ? `${failure.message} (the stream stalled after partial output; it was not retried to avoid duplicate paid work)`
            : failure.message,
          emitted ? 'STREAM_INTERRUPTED' : 'TIMEOUT',
          {
            cause: error,
            ...failure.failure.status === undefined ? {} : { status: failure.failure.status },
            ...requestId === undefined ? {} : { requestId: ProviderRequestId(requestId) },
          },
        )
      } else if (
        emitted &&
        ['SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE', 'RATE_LIMIT'].includes(failure.code)
      ) {
        // Retrying after a paid stream already produced output duplicates the
        // request and can merge two partial answers. Make that failure
        // non-retryable for the host policy.
        failure = new LlmError(
          `${failure.message} (the stream ended after partial output; it was not retried to avoid duplicate paid work)`,
          'STREAM_INTERRUPTED',
          {
            cause: error,
            ...failure.failure.status === undefined ? {} : { status: failure.failure.status },
            ...requestId === undefined ? {} : { requestId: ProviderRequestId(requestId) },
          },
        )
      }
      this.recordFailure(options, generation, wire, failure, started, headerMs, requestId, metrics)
      throw failure
    } finally {
      options.signal?.removeEventListener('abort', onAbort)
    }
    this.recordDiagnostic({
      at: new Date().toISOString(),
      provider: PROVIDER,
      model: options.model,
      protocol: wire.protocol,
      ...options.reasoningEffort === undefined ? {} : { requestedEffort: String(options.reasoningEffort) },
      ...wire.wireEffort === undefined ? {} : { wireEffort: wire.wireEffort },
      status: response.status,
      streamed: true,
      ...requestId === undefined ? {} : { requestId },
      ...headerMs === undefined ? {} : { headerMs },
      durationMs: this.now() - started,
      ...metrics.usage === undefined ? {} : { usage: metrics.usage },
      ...metrics.costUsd === undefined ? {} : { costUsd: metrics.costUsd },
    })
  }

  /** Record one failed request without request content. */
  private recordFailure(
    options: GenerateOptions,
    generation: Generation,
    wire: import('./protocols/common.js').PreparedWireRequest | undefined,
    failure: LlmError,
    started: number,
    headerMs?: number,
    requestId?: string,
    metrics?: { usage?: TokenUsage; costUsd?: number },
  ): void {
    const model = findGenerationModel(generation, options.model)
    this.recordDiagnostic({
      at: new Date().toISOString(),
      provider: PROVIDER,
      model: options.model,
      protocol: wire?.protocol ?? effectiveProtocol(generation.config, generation.preferences, model ?? ({ id: options.model } as CatalogModel)),
      ...options.reasoningEffort === undefined ? {} : { requestedEffort: String(options.reasoningEffort) },
      ...wire?.wireEffort === undefined ? {} : { wireEffort: wire.wireEffort },
      ...failure.failure.status === undefined ? {} : { status: failure.failure.status },
      streamed: headerMs !== undefined,
      ...requestId === undefined ? {} : { requestId },
      ...headerMs === undefined ? {} : { headerMs },
      durationMs: this.now() - started,
      ...metrics?.usage === undefined ? {} : { usage: metrics.usage },
      ...metrics?.costUsd === undefined ? {} : { costUsd: metrics.costUsd },
      failure: {
        code: failure.code,
        message: failure.message,
        ...failure.failure.status === undefined ? {} : { status: failure.failure.status },
        ...failure.failure.requestId === undefined ? {} : { requestId: failure.failure.requestId },
      } satisfies FailureInfo,
    })
  }

  /** Append one diagnostic entry. */
  private recordDiagnostic(entry: RequestDiagnostic): void {
    this.diagnostics.record(entry)
  }

  /**
   * Serialize a synthetic request with the real serializer, without sending it.
   * The returned headers carry a redacted placeholder instead of the credential.
   * @param options - sample request controls.
   * @returns the exact wire request the adapter would send.
   */
  async preview(options: GenerateOptions): Promise<import('./protocols/common.js').PreparedWireRequest> {
    const generation = this.capture()
    const prepared = await this.prepare(generation, options, true)
    return prepared.wire
  }

  /** Read (or reuse) provider discovery for one exact model. */
  async providerCatalogForModel(modelId: string, signal?: AbortSignal): Promise<ProviderCatalog | undefined> {
    return this.providerCatalog(this.options.config(), modelId, signal)
  }

  /** Diagnostic buffer access for the settings RPC. */
  diagnosticsBuffer(): Diagnostics {
    return this.diagnostics
  }

  /** Drop cached provider-discovery answers. */
  clearProviderCache(): void {
    this.providerCache.clear()
  }
}
