/**
 * Shared request construction for the three NanoGPT wire protocols.
 *
 * This module owns the parts that must not diverge between Chat Completions,
 * Responses, and Messages: provider routing, tool schema translation, request
 * controls, image/file projection, and historical tool-argument validation.
 * The protocol modules add only their own envelope and naming.
 *
 * @module dsh-nanogpt/protocols/common
 */
import {
  LlmError,
  projectToolUpdates,
  textOnlyImageText,
  type GenerateOptions,
  type RequestMessage,
  type ToolSchema,
} from '@deepseek-ai/dsh-llm'
import type { FileAttachmentRef, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment'
import type { AdvancedConfig, ResolvedConfig, RoutingConfig } from '../config.js'
import type { Preferences } from '../preferences.js'
import type { ReasoningPolicy, EffortSelection, WireReasoning } from '../reasoning.js'
import { wireReasoning } from '../reasoning.js'
import type { CatalogModel, Protocol, ReasoningVisibility, WireEffort } from '../shared.js'

/** One request image resolved to base64 plus its model-facing handle text. */
export interface ResolvedImage {
  /** Verified media type. */
  mediaType: string
  /** Base64-encoded request bytes. */
  data: string
  /** Deterministic text naming the image and its dimensions/path. */
  handle: string
}

/** Everything one protocol serializer reads. */
export interface ProtocolContext {
  config: ResolvedConfig
  preferences: Preferences
  model: CatalogModel
  policy: ReasoningPolicy | undefined
  selection: EffortSelection
  visibility: ReasoningVisibility
  options: GenerateOptions
  /** Resolve one durable file reference to its model-facing handle text. */
  resolveFileText: (ref: FileAttachmentRef) => string
  /** Resolve one durable image to request bytes, or undefined for a text placeholder. */
  resolveImage: (ref: ImageAttachmentRef, signal?: AbortSignal) => Promise<ResolvedImage | undefined>
}

/** A fully serialized request ready for authenticated transport. */
export interface PreparedWireRequest {
  /** Absolute endpoint. */
  url: string
  /** Request headers, including authentication and attribution. */
  headers: Record<string, string>
  /** JSON body. */
  body: Record<string, unknown>
  /** Protocol used. */
  protocol: Protocol
  /** Exact requested model id. */
  model: string
  /** Actual effort serialized, when one was sent. */
  wireEffort?: WireEffort
  /** Whether reasoning output was explicitly hidden. */
  excludeReasoning: boolean
  /** Output-token cap materialized into the request. */
  maxTokens?: number
  /** Provider routing id, when pinned. */
  provider?: string
  /** Non-fatal validation notes for diagnostics. */
  warnings: string[]
}

/** Result of converting one message list. */
export interface ConvertedMessages {
  /** Messages after the route's tool-update projection. */
  messages: readonly RequestMessage[]
  /** Tool declarations after the route's projection. */
  tools: readonly ToolSchema[]
}

/** Read the leading text of one content-block list. */
export function textOfBlocks(content: readonly { type: string; text?: string }[]): string {
  return content
    .filter((block): block is { type: 'text'; text: string } => block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/** Normalize historical tool arguments to a valid JSON object string without losing the call identity. */
export function safeHistoricalArguments(raw: string): string {
  if (typeof raw !== 'string' || raw.trim().length === 0) return '{}'
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return raw
  } catch {
    // Fall through to the neutral object.
  }
  return '{}'
}

/** Apply the route's tool-update projection and return declarations plus history. */
export function projectedMessages(options: GenerateOptions): ConvertedMessages {
  const projected = projectToolUpdates(options.messages, options.tools, undefined)
  return {
    messages: projected.messages,
    tools: projected.tools ?? [],
  }
}

/** Translate one tool declaration into Chat Completions' nested function shape. */
export function chatTools(tools: readonly ToolSchema[]): Record<string, unknown>[] | undefined {
  if (tools.length === 0) return undefined
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))
}

/** Translate one tool declaration into Responses' flat function shape. */
export function responsesTools(tools: readonly ToolSchema[]): Record<string, unknown>[] | undefined {
  if (tools.length === 0) return undefined
  return tools.map((tool) => ({
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
    strict: false,
  }))
}

/** Translate one tool declaration into Anthropic Messages' shape. */
export function messagesTools(tools: readonly ToolSchema[]): Record<string, unknown>[] | undefined {
  if (tools.length === 0) return undefined
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
}

/** Validate a public provider id before it can reach a header. */
export function validProviderId(id: string | undefined): id is string {
  return id !== undefined && /^[a-z0-9][a-z0-9._-]{0,63}$/i.test(id)
}

/** Routing fields, headers, and model suffixes for one request. */
export interface RoutingApplication {
  headers: Record<string, string>
  body: Record<string, unknown>
  /** Documented model suffixes for transports without routing body fields. */
  suffixes: string[]
  warnings: string[]
  provider?: string
}

/** The documented routing-goal suffix for one mode, when a suffix is required. */
const ROUTING_MODE_SUFFIX: Readonly<Record<string, string>> = {
  speed: 'speed',
  throughput: 'throughput',
  latency: 'latency',
  price: 'price',
}

/**
 * Turn the selected routing controls into documented request fields.
 *
 * Chat Completions accepts the structured `provider` object plus top-level
 * `caching`/`stickyProvider`; Responses and Anthropic Messages document no
 * such body fields, so their routing goals/caching travel as the same model
 * suffixes the public suffix reference lists (`:speed`, `:throughput`,
 * `:latency`, `:price`, `:caching`). Explicit providers use `X-Provider` on
 * every transport, and the pay-as-you-go override uses `X-Billing-Mode`.
 *
 * @param routing - effective routing (model preference over profile default).
 * @param model - exact model, for tier validation.
 * @param config - connection facts.
 * @param protocol - selected wire protocol.
 * @returns body fields, headers, suffixes, and warnings.
 * @throws LlmError with `UNSUPPORTED_OPTION` for a conflicting or unsupported combination.
 */
export function routingApplication(
  routing: RoutingConfig,
  model: CatalogModel,
  config: ResolvedConfig,
  protocol: Protocol = 'chat',
): RoutingApplication {
  const body: Record<string, unknown> = {}
  const headers: Record<string, string> = {}
  const suffixes: string[] = []
  const warnings: string[] = []
  let provider: string | undefined
  if (routing.caching === true && routing.mode === 'provider') {
    throw new LlmError(
      'cache-capable routing (`caching: true`) cannot be combined with an explicit upstream provider; choose one routing strategy',
      'UNSUPPORTED_OPTION',
    )
  }
  if (routing.caching === true && protocol !== 'chat' && routing.mode !== 'auto') {
    throw new LlmError(
      'cache-capable routing (`caching: true`) cannot be combined with a routing goal on this transport; choose one strategy',
      'UNSUPPORTED_OPTION',
    )
  }
  if (routing.stickyProvider === true && routing.caching !== true) {
    throw new LlmError('stickyProvider requires caching: true', 'UNSUPPORTED_OPTION')
  }
  if (routing.mode === 'provider') {
    if (!validProviderId(routing.provider)) {
      throw new LlmError('routing.provider must be a public NanoGPT provider id', 'UNSUPPORTED_OPTION')
    }
    provider = routing.provider
    headers['X-Provider'] = routing.provider
    warnings.push(`Explicit provider ${routing.provider} is billed pay-as-you-go at that route's price.`)
  } else if (routing.mode !== 'auto') {
    const suffix = ROUTING_MODE_SUFFIX[routing.mode]
    if (suffix === undefined) {
      throw new LlmError(`routing mode "${routing.mode}" has no documented request representation`, 'UNSUPPORTED_OPTION')
    }
    if (protocol === 'chat') {
      body.provider = {
        sort: routing.mode,
        ...routing.allowFallbacks === false ? { allow_fallbacks: false } : {},
      }
    } else {
      suffixes.push(suffix)
      if (routing.allowFallbacks === false) {
        warnings.push(
          `allowFallbacks is not a documented field on the ${protocol === 'responses' ? 'Responses' : 'Messages'} transport; fallback is left at the provider default.`,
        )
      }
    }
  } else if (routing.allowFallbacks === false) {
    warnings.push('allowFallbacks has no meaning without a routing goal or a pinned provider; it was ignored.')
  }
  if (routing.caching === true) {
    if (protocol === 'chat') {
      body.caching = true
      if (routing.stickyProvider === true) body.stickyProvider = true
    } else {
      suffixes.push('caching')
      if (routing.stickyProvider === true) {
        warnings.push(
          `The ${protocol === 'responses' ? 'Responses' : 'Messages'} transport has no documented stickyProvider field; cache affinity is requested without disabling fallback.`,
        )
      }
    }
    warnings.push('Cache-capable routing requires a cache-capable upstream and can fail when none is available.')
  }
  if (routing.billingMode === 'paygo') {
    // The documented generic form is a header; Chat Completions also documents
    // the body alias, but one representation keeps every protocol consistent.
    headers['X-Billing-Mode'] = 'paygo'
    if (protocol === 'chat') body.billing_mode = 'paygo'
    warnings.push('Pay-as-you-go billing is forced for this request.')
  }
  const tier = routing.serviceTier
  if (tier !== undefined && tier !== 'auto') {
    const allowedByProtocol: Readonly<Record<Protocol, readonly string[]>> = {
      chat: ['auto', 'default', 'flex', 'fast', 'priority', 'ultrafast'],
      responses: ['auto', 'default', 'flex', 'fast', 'priority'],
      messages: ['auto', 'default', 'standard', 'flex', 'fast', 'priority', 'batch'],
    }
    if (!allowedByProtocol[protocol].includes(tier)) {
      throw new LlmError(
        `service tier "${tier}" is not documented for the ${protocol} transport; documented: ${allowedByProtocol[protocol].join(', ')}`,
        'UNSUPPORTED_OPTION',
      )
    }
    const modelAdvertised = tier === 'flex' || tier === 'fast' || tier === 'priority' || tier === 'ultrafast'
    if (modelAdvertised && model.serviceTiers.length > 0 && !model.serviceTiers.includes(tier)) {
      throw new LlmError(
        `model "${model.id}" does not advertise service tier "${tier}"; supported: ${model.serviceTiers.join(', ')}`,
        'UNSUPPORTED_OPTION',
      )
    }
    if (modelAdvertised && model.serviceTiers.length === 0) {
      throw new LlmError(`model "${model.id}" advertises no non-default service tier`, 'UNSUPPORTED_OPTION')
    }
    body.service_tier = tier
  }
  return {
    headers,
    body,
    suffixes,
    warnings,
    ...provider === undefined ? {} : { provider },
  }
}

/** Append documented model suffixes in the reference's order. */
export function modelWithSuffixes(modelId: string, suffixes: readonly string[]): string {
  return suffixes.length === 0 ? modelId : `${modelId}:${suffixes.join(':')}`
}

/** Select the documented web-search model suffix, when one is configured. */
export function webSearchModel(modelId: string, advanced: AdvancedConfig): { model: string; suffix?: string; warning?: string } {
  const mode = advanced.webSearch
  if (mode === undefined || mode === 'off') return { model: modelId }
  return {
    model: modelId,
    suffix: mode,
    warning: `Web search suffix ":${mode}" is appended; searches are billed separately by NanoGPT.`,
  }
}

/** Merge deployment extra fields after every computed field. */
export function applyExtraBody(body: Record<string, unknown>, advanced: AdvancedConfig): void {
  if (advanced.extraBody === undefined) return
  for (const [key, value] of Object.entries(advanced.extraBody)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue
    body[key] = value
  }
}

/** Effective advanced controls: model override over user preference over deployment. */
export function effectiveAdvanced(config: ResolvedConfig, preferences: Preferences, model: CatalogModel): AdvancedConfig {
  const modelOverride = config.models.find((entry) => entry.id === model.id)?.advanced
  const userModelOverride = preferences.models[model.id]?.advanced
  const layers = [config.advanced, preferences.advanced, modelOverride, userModelOverride]
  const merged: AdvancedConfig = Object.assign({}, ...layers)
  const promptCaching = Object.assign(
    {},
    ...layers.map((layer) => layer?.promptCaching).filter((value): value is NonNullable<typeof value> => value !== undefined),
  )
  const extraBody = Object.assign(
    {},
    ...layers.map((layer) => layer?.extraBody).filter((value): value is NonNullable<typeof value> => value !== undefined),
  )
  if (Object.keys(promptCaching).length === 0) delete merged.promptCaching
  else merged.promptCaching = promptCaching
  if (Object.keys(extraBody).length === 0) delete merged.extraBody
  else merged.extraBody = extraBody
  return merged
}

/** Effective routing controls: model preference over user default over deployment. */
export function effectiveRouting(config: ResolvedConfig, preferences: Preferences, model: CatalogModel): RoutingConfig {
  const modelOverride =
    preferences.models[model.id]?.routing ?? config.models.find((entry) => entry.id === model.id)?.routing
  return { ...config.routing, ...preferences.routing ?? {}, ...modelOverride ?? {} }
}

/** Effective protocol: model preference over user model preference over deployment. */
export function effectiveProtocol(config: ResolvedConfig, preferences: Preferences, model: CatalogModel): Protocol {
  return (
    preferences.models[model.id]?.protocol ??
    config.models.find((entry) => entry.id === model.id)?.protocol ??
    config.protocol
  )
}

/** Effective max-token cap, or undefined when the caller and configuration name none. */
export function effectiveMaxTokens(options: GenerateOptions, config: ResolvedConfig, advanced: AdvancedConfig): number | undefined {
  return options.maxTokens ?? advanced.maxTokens ?? config.defaultMaxTokens
}

/** Effective temperature. */
export function effectiveTemperature(options: GenerateOptions, config: ResolvedConfig, advanced: AdvancedConfig): number | undefined {
  return options.temperature ?? advanced.temperature ?? config.temperature
}

/** Effective nucleus sampling. */
export function effectiveTopP(config: ResolvedConfig, advanced: AdvancedConfig): number | undefined {
  return advanced.topP ?? config.topP
}

/** Build the protocol-independent reasoning fields once. */
export function reasoningFields(
  context: ProtocolContext,
  protocol: Protocol,
): WireReasoning {
  return wireReasoning(
    protocol,
    context.selection,
    context.policy,
    context.visibility,
    context.model.id,
  )
}

/** Whether an image should be sent as image input for this model. */
export function modelAcceptsImages(model: CatalogModel): boolean {
  return model.inputModalities?.includes('image') === true || model.vision === true
}

/**
 * Resolve one image block, falling back to its deterministic text placeholder
 * when the route is text-only, the occurrence was offloaded, or the attachment
 * cannot be read in this deployment.
 */
export async function projectImage(
  context: ProtocolContext,
  block: { type: 'image'; attachment: ImageAttachmentRef; offloaded?: true },
): Promise<ResolvedImage | undefined> {
  if (block.offloaded === true || !modelAcceptsImages(context.model)) {
    return undefined
  }
  try {
    return await context.resolveImage(block.attachment, context.options.signal)
  } catch (error) {
    if (error instanceof LlmError) throw error
    return undefined
  }
}

/** Deterministic text shown in place of an image the route cannot receive. */
export function imagePlaceholder(block: { type: 'image'; attachment: ImageAttachmentRef }): string {
  return textOnlyImageText(block.attachment)
}

/** Resolve a file block to its deterministic handle text. */
export function projectFile(context: ProtocolContext, ref: FileAttachmentRef): string {
  try {
    return context.resolveFileText(ref)
  } catch {
    return `[file ${ref.name}, ${ref.bytes} bytes]`
  }
}

/** Normalize a finish reason without inventing a new one. */
export function finishReason(kind: 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error', failure?: { code: string; message: string }): {
  kind: 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error'
  failure?: { code: string; message: string }
} {
  return { kind, ...failure === undefined ? {} : { failure } }
}
