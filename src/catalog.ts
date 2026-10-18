/**
 * NanoGPT catalog normalization.
 *
 * The detailed `/models` answer is the authority for model identity, context,
 * output limits, input modalities, service tiers, pricing, subscription
 * visibility, and the exact reasoning-effort ladder. This module only
 * normalizes what the endpoint disclosed; it never invents a capability, a
 * price, or a limit. Fields the catalog omits stay absent, which is how the
 * settings UI distinguishes "free" from "unknown".
 *
 * @module dsh-nanogpt/catalog
 */
import { createHash } from 'node:crypto'
import type { ResolvedModelOverride } from './config.js'
import {
  WIRE_EFFORTS,
  type CatalogModel,
  type CatalogSnapshot,
  type PricePerMillion,
  type WireEffort,
} from './shared.js'

/** Raw catalog record, intentionally loose because additive fields are expected. */
type RawRecord = Record<string, unknown>

/** A normalized catalog model plus the non-DSH output modalities it disclosed. */
export interface NormalizedCatalogModel extends CatalogModel {
  /** Output modalities from `architecture.output_modalities`. */
  outputModalities?: readonly string[]
}

/** Narrow an unknown value to a plain record. */
export function isRecord(value: unknown): value is RawRecord {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Read one optional finite non-negative number. */
export function optionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return value
}

/**
 * Read one optional finite non-negative number from a number or a numeric
 * string. NanoGPT's account endpoints document string balances ("1.234") and
 * quota caps in both shapes, so parsing must accept both instead of showing a
 * missing balance.
 */
export function optionalNumeric(value: unknown): number | undefined {
  if (typeof value === 'number') return optionalNumber(value)
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > 64) return undefined
  const parsed = Number(trimmed)
  return optionalNumber(parsed)
}

/** Read one optional positive integer. */
export function optionalPositiveInteger(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !Number.isInteger(value)) return undefined
  return value
}

/** Read one optional boolean. */
export function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

/** Read one optional non-empty string. */
export function optionalString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length === 0 ? undefined : trimmed
}

/** Strip control characters and bound a catalog description for safe text rendering. */
export function sanitizeText(value: unknown, limit = 4_000): string | undefined {
  if (typeof value !== 'string') return undefined
  const text = value
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  if (text.length === 0) return undefined
  return text.length > limit ? `${text.slice(0, limit)}…` : text
}

/**
 * Validate and order the reasoning values an endpoint advertised.
 * Unknown future values are dropped rather than treated as supported.
 * @param values - raw `reasoning_efforts` list.
 * @returns known efforts in escalation order, or undefined when the field was absent.
 */
export function normalizeEfforts(values: unknown): readonly WireEffort[] | undefined {
  if (!Array.isArray(values)) return undefined
  const set = new Set<WireEffort>()
  for (const value of values) {
    if (typeof value === 'string' && (WIRE_EFFORTS as readonly string[]).includes(value)) {
      set.add(value as WireEffort)
    }
  }
  return WIRE_EFFORTS.filter((effort) => set.has(effort))
}

/** Read a string array from an unknown value, preserving order and dropping non-strings. */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0))]
}

/** Convert a per-thousand-token rate to a per-million-token rate. */
function perMillion(value: unknown): number | undefined {
  const number = optionalNumber(value)
  return number === undefined ? undefined : number * 1_000
}

/** Read a rate whose field name states that its unit is per 1,000 tokens. */
function namedPer1k(value: unknown): number | undefined {
  const number = optionalNumber(value)
  return number === undefined ? undefined : number * 1_000
}

/** Read a rate using the object's own unit, with per-1k field names winning. */
function unitAware(value: unknown, unit: unknown): number | undefined {
  const number = optionalNumber(value)
  if (number === undefined) return undefined
  if (unit === 'per_1k_tokens' || unit === 'per_1k') return number * 1_000
  return number
}

/** Normalize the two pricing shapes NanoGPT returns. */
export function normalizePricing(raw: RawRecord): { pricing?: PricePerMillion; source?: string; currency?: string } {
  const pricingObject = isRecord(raw.pricing) ? raw.pricing : undefined
  const effectiveObject = isRecord(raw.effective_pricing) ? raw.effective_pricing : undefined
  const effectivePrice = isRecord(effectiveObject?.effective_price) ? effectiveObject.effective_price : undefined
  const effectiveUnit = effectiveObject?.unit ?? 'per_1k_tokens'
  const listUnit = pricingObject?.unit ?? 'per_million_tokens'
  const list: PricePerMillion = {}
  if (pricingObject !== undefined) {
    const input = unitAware(pricingObject.prompt, listUnit)
    const output = unitAware(pricingObject.completion, listUnit)
    const cacheRead =
      namedPer1k(pricingObject.cacheReadInputPer1kTokens) ?? unitAware(pricingObject.cacheReadInputPerMillionTokens, listUnit)
    const cacheWrite =
      namedPer1k(pricingObject.cacheWriteInputPer1kTokens) ?? unitAware(pricingObject.cacheWriteInputPerMillionTokens, listUnit)
    if (input !== undefined) list.input = input
    if (output !== undefined) list.output = output
    if (cacheRead !== undefined) list.cacheRead = cacheRead
    if (cacheWrite !== undefined) list.cacheWrite = cacheWrite
  }
  const effective: PricePerMillion = {}
  if (effectivePrice !== undefined) {
    const input = unitAware(effectivePrice.inputPer1kTokens, effectiveUnit)
    const output = unitAware(effectivePrice.outputPer1kTokens, effectiveUnit)
    const cacheRead = unitAware(effectivePrice.cacheReadInputPer1kTokens, effectiveUnit)
    const cacheWrite = unitAware(effectivePrice.cacheWriteInputPer1kTokens, effectiveUnit)
    if (input !== undefined) effective.input = input
    if (output !== undefined) effective.output = output
    if (cacheRead !== undefined) effective.cacheRead = cacheRead
    if (cacheWrite !== undefined) effective.cacheWrite = cacheWrite
  }
  const chosen =
    effective.input !== undefined || effective.output !== undefined
      ? effective
      : list.input !== undefined || list.output !== undefined
        ? list
        : undefined
  const currency = optionalString(pricingObject?.currency) ?? optionalString(effectiveObject?.currency)
  if (chosen === undefined) return currency === undefined ? {} : { currency }
  return {
    pricing: chosen,
    source:
      chosen === effective
        ? optionalString(effectiveObject?.pricing_type) ?? 'effective'
        : optionalString(pricingObject?.unit) ?? 'list',
    ...currency === undefined ? {} : { currency },
  }
}

/** Normalize one raw model record; returns undefined only when the record has no id. */
export function normalizeModel(raw: RawRecord, fetchedAt: string): NormalizedCatalogModel | undefined {
  const id = optionalString(raw.id)
  if (id === undefined) return undefined
  const architecture = isRecord(raw.architecture) ? raw.architecture : undefined
  const capabilities = isRecord(raw.capabilities) ? raw.capabilities : undefined
  const subscription = isRecord(raw.subscription) ? raw.subscription : undefined
  const inputModalitiesRaw = stringArray(architecture?.input_modalities)
  const outputModalities = stringArray(architecture?.output_modalities)
  const vision = optionalBoolean(capabilities?.vision)
  const imageFromModalities = inputModalitiesRaw.includes('image')
  const image = vision === true || imageFromModalities ? true : vision === false ? false : undefined
  let inputModalities: readonly ('text' | 'image')[] | undefined
  if (image === true) inputModalities = ['text', 'image']
  else if (image === false) inputModalities = ['text']
  const efforts = normalizeEfforts(raw.reasoning_efforts)
  const reasoning = optionalBoolean(capabilities?.reasoning)
  const pricing = normalizePricing(raw)
  const name = optionalString(raw.name) ?? id
  return {
    id,
    name,
    ...sanitizeText(raw.description) === undefined ? {} : { description: sanitizeText(raw.description) },
    ...optionalString(raw.owned_by) === undefined ? {} : { provider: optionalString(raw.owned_by) },
    ...optionalPositiveInteger(raw.context_length) === undefined ? {} : { contextWindow: optionalPositiveInteger(raw.context_length) },
    ...optionalPositiveInteger(raw.max_output_tokens) === undefined
      ? {}
      : { maxOutputTokens: optionalPositiveInteger(raw.max_output_tokens) },
    ...inputModalities === undefined ? {} : { inputModalities },
    ...vision === undefined ? {} : { vision },
    ...optionalBoolean(capabilities?.video_input) === undefined ? {} : { videoInput: optionalBoolean(capabilities?.video_input) },
    ...optionalBoolean(capabilities?.audio_input) === undefined ? {} : { audioInput: optionalBoolean(capabilities?.audio_input) },
    ...optionalBoolean(capabilities?.pdf_upload) === undefined ? {} : { pdfUpload: optionalBoolean(capabilities?.pdf_upload) },
    ...reasoning === undefined ? {} : { reasoning },
    ...efforts === undefined ? {} : { reasoningEfforts: efforts },
    ...optionalBoolean(capabilities?.tool_calling) === undefined
      ? {}
      : { toolCalling: optionalBoolean(capabilities?.tool_calling) },
    ...optionalBoolean(capabilities?.parallel_tool_calls) === undefined
      ? {}
      : { parallelToolCalls: optionalBoolean(capabilities?.parallel_tool_calls) },
    ...optionalBoolean(capabilities?.structured_output) === undefined
      ? {}
      : { structuredOutput: optionalBoolean(capabilities?.structured_output) },
    serviceTiers: stringArray(raw.supported_service_tiers),
    ...pricing.pricing === undefined ? {} : { pricing: pricing.pricing },
    ...pricing.source === undefined ? {} : { pricingSource: pricing.source },
    ...pricing.currency === undefined ? {} : { currency: pricing.currency },
    ...optionalBoolean(subscription?.included) === undefined
      ? {}
      : { subscriptionIncluded: optionalBoolean(subscription?.included) },
    ...optionalNumber(subscription?.inputTokenMultiplier) === undefined
      ? {}
      : { subscriptionInputMultiplier: optionalNumber(subscription?.inputTokenMultiplier) },
    ...optionalString(subscription?.note) === undefined ? {} : { subscriptionNote: optionalString(subscription?.note) },
    ...optionalString(raw.category) === undefined ? {} : { category: optionalString(raw.category) },
    ...optionalBoolean(raw.open_weights) === undefined ? {} : { openWeights: optionalBoolean(raw.open_weights) },
    aliases: stringArray(raw.aliases),
    providers: stringArray(raw.providers),
    source: 'api',
    verifiedAt: fetchedAt,
    ...outputModalities.length === 0 ? {} : { outputModalities },
  }
}

/** Whether a catalog record describes a text-output chat model DSH can select. */
export function isChatModel(model: NormalizedCatalogModel): boolean {
  const outputs = model.outputModalities
  if (outputs !== undefined && outputs.length > 0 && !outputs.includes('text')) return false
  return model.category !== 'Decisions' || outputs?.includes('text') === true
}

/** Stable hash of the normalized facts used for change detection. */
export function catalogHash(models: readonly CatalogModel[]): string {
  const hash = createHash('sha256')
  for (const model of models) {
    hash.update(model.id)
    hash.update('\0')
    hash.update(model.name)
    hash.update('\0')
    hash.update(String(model.contextWindow ?? ''))
    hash.update('\0')
    hash.update(String(model.maxOutputTokens ?? ''))
    hash.update('\0')
    hash.update((model.reasoningEfforts ?? []).join(','))
    hash.update('\0')
    hash.update(String(model.reasoning ?? ''))
    hash.update('\0')
    hash.update(String(model.toolCalling ?? ''))
    hash.update('\0')
    hash.update(String(model.vision ?? ''))
    hash.update('\0')
    hash.update(JSON.stringify(model.pricing ?? {}))
    hash.update('\0')
    hash.update(model.serviceTiers.join(','))
    hash.update('\0')
    hash.update(model.providers.join(','))
    hash.update('\n')
  }
  return hash.digest('hex')
}

/** Normalize one detailed `/models` answer. */
export function normalizeCatalogResponse(
  body: unknown,
  endpoint: string,
  fetchedAt: string,
): { snapshot: CatalogSnapshot; models: readonly NormalizedCatalogModel[] } {
  const records = Array.isArray(body)
    ? body
    : isRecord(body) && Array.isArray(body.data)
      ? body.data
      : isRecord(body) && isRecord(body.models)
        ? Object.entries(body.models).map(([id, value]) => (isRecord(value) ? { id, ...value } : { id }))
        : undefined
  if (records === undefined) {
    throw new Error('NanoGPT models response has neither a `data` array nor a `models` object')
  }
  const models: NormalizedCatalogModel[] = []
  const seen = new Set<string>()
  for (const record of records) {
    if (!isRecord(record)) continue
    const model = normalizeModel(record, fetchedAt)
    if (model === undefined || seen.has(model.id) || !isChatModel(model)) continue
    seen.add(model.id)
    models.push(model)
  }
  const snapshot: CatalogSnapshot = {
    version: 1,
    endpoint,
    fetchedAt,
    source: 'api',
    models,
    rawCount: records.length,
    hash: catalogHash(models),
  }
  return { snapshot, models }
}

/** Merge one deployment override over a catalog record, or create a declared model. */
export function applyModelOverride(
  base: CatalogModel | undefined,
  override: ResolvedModelOverride,
  verifiedAt = new Date().toISOString(),
): CatalogModel {
  const model: CatalogModel = base ?? {
    id: override.id,
    name: override.id,
    serviceTiers: [],
    aliases: [],
    providers: [],
    source: override.source ?? 'user-config',
    verifiedAt,
  }
  const name = override.name ?? model.name
  const efforts = override.reasoningDisabled === true ? undefined : override.reasoningEfforts
  const reasoning = override.reasoningDisabled === true ? false : efforts !== undefined ? true : model.reasoning
  const result: CatalogModel = {
    ...model,
    name,
    ...override.contextWindow === undefined ? {} : { contextWindow: override.contextWindow },
    ...override.maxTokens === undefined ? {} : { maxOutputTokens: override.maxTokens },
    ...override.inputModalities === undefined ? {} : { inputModalities: [...override.inputModalities] },
    ...reasoning === undefined ? {} : { reasoning },
    source: override.source ?? 'user-config',
    verifiedAt:
      (override.source === 'api' || override.source === 'api-route') && base !== undefined
        ? model.verifiedAt ?? verifiedAt
        : verifiedAt,
  }
  if (override.reasoningDisabled === true) {
    delete result.reasoningEfforts
  } else if (efforts !== undefined) {
    result.reasoningEfforts = efforts
  }
  return result
}

/** Build the merged model list: catalog order, then hand-declared models appended. */
export function mergeModelOverrides(
  catalog: readonly CatalogModel[],
  overrides: readonly ResolvedModelOverride[],
): CatalogModel[] {
  const byId = new Map<string, CatalogModel>(catalog.map((model) => [model.id, model]))
  const aliasToId = new Map<string, string>()
  for (const model of catalog) {
    for (const alias of model.aliases) aliasToId.set(alias, model.id)
  }
  for (const override of overrides) {
    const targetId = byId.has(override.id) ? override.id : aliasToId.get(override.id) ?? override.id
    byId.set(targetId, applyModelOverride(byId.get(targetId), override))
  }
  return [...byId.values()]
}

/** Find one model by exact id, then by a documented alias. */
export function findModel(models: readonly CatalogModel[], id: string): CatalogModel | undefined {
  const exact = models.find((model) => model.id === id)
  if (exact !== undefined) return exact
  return models.find((model) => model.aliases.includes(id))
}

/** Human-readable effort name used by DSH selectors and the settings page. */
export function effortName(effort: WireEffort): string {
  switch (effort) {
    case 'none':
      return 'None'
    case 'minimal':
      return 'Minimal'
    case 'low':
      return 'Low'
    case 'medium':
      return 'Medium'
    case 'high':
      return 'High'
    case 'xhigh':
      return 'Extra high'
    case 'max':
      return 'Max'
  }
}

/** Short, honest description of what each effort means on NanoGPT. */
export function effortDescription(effort: WireEffort): string {
  switch (effort) {
    case 'none':
      return 'Requests disabled reasoning where the model supports turning thinking off.'
    case 'minimal':
      return 'Lowest reasoning depth; available only where the model advertises it.'
    case 'low':
      return 'Low reasoning depth.'
    case 'medium':
      return 'Medium reasoning depth.'
    case 'high':
      return 'High reasoning depth.'
    case 'xhigh':
      return 'Extra-high reasoning depth, distinct from high and max.'
    case 'max':
      return 'Maximum reasoning effort, distinct from xhigh where both are supported.'
  }
}
