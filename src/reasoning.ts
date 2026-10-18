/**
 * Reasoning capability resolution and wire mapping.
 *
 * The resolver answers one question per exact model: which NanoGPT effort
 * values are actually selectable, what the default is, whether reasoning can
 * be disabled, and where that fact came from. It never turns a generic
 * `capabilities.reasoning: true` into seven selectable levels. The wire mapper
 * is the only place a selected level becomes `reasoning_effort`,
 * `reasoning.effort`, `output_config.effort`, or `thinking.type: disabled`.
 *
 * @module dsh-nanogpt/reasoning
 */
import {
  WIRE_EFFORTS,
  type CapabilitySource,
  type CatalogModel,
  type Protocol,
  type ReasoningVisibility,
  type WireEffort,
} from './shared.js'

/** An adapter-owned selection; `auto`/undefined means "omit the effort". */
export type EffortSelection = WireEffort | 'off' | 'auto' | undefined

/** One verified, documented model policy used only when the catalog is silent. */
interface DocumentedPolicy {
  efforts: readonly WireEffort[]
  defaultEffort?: WireEffort
  alwaysThinking?: boolean
  note: string
}

/**
 * Model-specific facts taken from NanoGPT's own documentation. These are used
 * only when `/models?detailed=true` does not advertise a `reasoning_efforts`
 * ladder; an API answer always wins. Each entry names the documented fact.
 */
const DOCUMENTED_POLICIES: Readonly<Record<string, DocumentedPolicy>> = {
  'anthropic/claude-opus-5.5': {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    defaultEffort: 'high',
    alwaysThinking: true,
    note: 'Adaptive thinking; NanoGPT documents low/medium/high/xhigh/max, default high, and rejects none. Forced tool choice is unsupported.',
  },
  'anthropic/claude-fable-5.1': {
    efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
    alwaysThinking: true,
    note: 'Inline-effort documentation lists low/medium/high/xhigh/max; minimal maps to low and none is rejected.',
  },
  'openai/gpt-6-astra': {
    efforts: ['low', 'medium', 'high', 'xhigh'],
    note: 'Inline-effort documentation lists low/medium/high/xhigh for this model.',
  },
}

/** Provider-route facts that can narrow or broaden a model-level ladder. */
export interface RouteReasoningInput {
  /** Public provider id, for diagnostics. */
  provider: string
  /** Effort values this exact route advertises. */
  efforts?: readonly WireEffort[]
  /** Whether this route cannot turn thinking off. */
  alwaysThinking?: boolean
}

/** An explicit model-level override (deployment or user preference). */
export interface ReasoningOverride {
  /** Exact list of supported efforts. */
  efforts?: readonly WireEffort[]
  /** Explicitly declare the model non-reasoning. */
  disabled?: boolean
  /** Provenance for UI presentation. */
  source?: CapabilitySource
}

/** Inputs to one capability resolution. */
export interface ReasoningResolutionInput {
  /** Normalized catalog or hand-declared model. */
  model: CatalogModel
  /** Pinned upstream route facts, when one is selected. */
  route?: RouteReasoningInput
  /** Explicit model override from deployment configuration or preferences. */
  override?: ReasoningOverride
  /** Deployment/profile default effort. */
  configuredDefault?: WireEffort | 'auto'
  /** Model-specific default effort from a user preference. */
  modelDefault?: WireEffort | 'auto'
  /** Whether experimental effort values may be advertised when the ladder is unknown. */
  experimental?: boolean
}

/** Resolved reasoning capability for one exact model/route. */
export interface ReasoningPolicy {
  /** Selectable wire efforts, in escalation order. */
  efforts: readonly WireEffort[]
  /** Default effort materialized by the adapter, or undefined for the provider default. */
  defaultEffort?: WireEffort
  /** Where the offered ladder came from. */
  source: CapabilitySource
  /** Whether the model is documented to always reason. */
  alwaysThinking: boolean
  /** Whether `none` is a legal, functional disable selection. */
  supportsDisable: boolean
  /** Whether the ladder is unknown rather than disclosed. */
  unknown: boolean
  /** Whether any offered value is an experimental inference/override. */
  experimental: boolean
  /** Levels not confirmed by the current API catalog. */
  unverifiedLevels: readonly WireEffort[]
  /** Human-readable provenance/limitation notes. */
  notes: readonly string[]
  /** Catalog verification instant, when available. */
  verifiedAt?: string
  /** Pinned route this policy describes, when one was selected. */
  route?: string
}

/** Deduplicate and order a candidate effort list. */
function orderedEfforts(values: readonly WireEffort[]): WireEffort[] {
  const set = new Set(values)
  return WIRE_EFFORTS.filter((effort) => set.has(effort))
}

/** Compare two effort lists for equality. */
function sameEfforts(a: readonly WireEffort[] | undefined, b: readonly WireEffort[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Resolve one model's reasoning capability.
 *
 * Priority follows the specification: explicit provider-route facts, then the
 * API catalog ladder, then model-specific official documentation, then an
 * explicit user/deployment override, then a clearly marked inference. An
 * override that widens the ladder keeps both facts visible: the offered levels
 * are the override's, and every level the catalog did not confirm is listed in
 * `unverifiedLevels`.
 *
 * @param input - exact model, optional route, override, and defaults.
 * @returns the policy, or undefined for a model with no reasoning control.
 */
export function resolveReasoning(input: ReasoningResolutionInput): ReasoningPolicy | undefined {
  const { model, route, override } = input
  if (override?.disabled === true) return undefined
  const notes: string[] = []
  const apiLevels = model.reasoningEfforts === undefined ? undefined : orderedEfforts(model.reasoningEfforts)
  const documented = DOCUMENTED_POLICIES[model.id]
  let efforts: WireEffort[] = []
  let source: CapabilitySource = 'unknown'
  let unknown = false
  let inferred = false

  if (route?.efforts !== undefined) {
    efforts = orderedEfforts(route.efforts)
    source = 'api-route'
    if (apiLevels !== undefined && !sameEfforts(efforts, apiLevels)) {
      notes.push(
        `Provider ${route.provider} advertises a ${efforts.length > 0 ? efforts.join('/') : 'default-only'} ladder that differs from the model-wide catalog.`,
      )
    }
  } else if (override?.efforts !== undefined) {
    efforts = orderedEfforts(override.efforts)
    source = override.source ?? 'user-config'
    if (apiLevels !== undefined && !sameEfforts(efforts, apiLevels)) {
      notes.push(
        `User override differs from the catalog ladder (${apiLevels.length > 0 ? apiLevels.join('/') : 'none disclosed'}); values outside it are marked unverified.`,
      )
    }
  } else if (apiLevels !== undefined && apiLevels.length > 0) {
    efforts = [...apiLevels]
    source = 'api'
  } else if (documented !== undefined) {
    efforts = [...documented.efforts]
    source = 'documentation'
    notes.push(documented.note)
  } else if (model.reasoning === true) {
    efforts = []
    source = 'unknown'
    unknown = true
    notes.push('The catalog says this model reasons but does not advertise its effort ladder; only the provider default can be selected.')
  } else if (model.reasoning === false) {
    return undefined
  } else if (override === undefined) {
    return undefined
  }

  if (route?.alwaysThinking === true && efforts.includes('none')) {
    efforts = efforts.filter((effort) => effort !== 'none')
    notes.push(`Provider ${route.provider} reports that reasoning cannot be disabled; none was removed.`)
  }
  if (input.experimental === true && efforts.length === 0) {
    efforts = [...WIRE_EFFORTS]
    source = 'inferred'
    inferred = true
    unknown = false
    notes.push('Experimental mode advertises all seven values even though the ladder is not disclosed; unsupported values fail at the provider.')
  }
  if (efforts.length === 0 && !unknown) return undefined

  const apiEffortSet = new Set(apiLevels ?? [])
  const unverifiedLevels = inferred ? [...efforts] : efforts.filter((effort) => !apiEffortSet.has(effort))
  const alwaysThinking =
    route?.alwaysThinking === true ||
    (model.reasoning === true && !efforts.includes('none')) ||
    (documented?.alwaysThinking === true && !efforts.includes('none'))
  const supportsDisable = efforts.includes('none') && !alwaysThinking

  let defaultEffort: WireEffort | undefined
  const candidates: { effort: WireEffort | 'auto' | undefined; label: string }[] = [
    { effort: input.modelDefault, label: 'model preference' },
    { effort: input.configuredDefault, label: 'profile default' },
    { effort: documented?.defaultEffort, label: 'documented model default' },
  ]
  for (const candidate of candidates) {
    if (candidate.effort === undefined || candidate.effort === 'auto') continue
    if (efforts.includes(candidate.effort)) {
      defaultEffort = candidate.effort
      break
    }
    notes.push(`The ${candidate.label} "${candidate.effort}" is not offered by this model and was ignored (provider default stays in effect).`)
  }

  return {
    efforts,
    ...defaultEffort === undefined ? {} : { defaultEffort },
    source,
    alwaysThinking,
    supportsDisable,
    unknown,
    experimental: inferred || unverifiedLevels.length > 0,
    unverifiedLevels,
    notes,
    ...model.verifiedAt === undefined ? {} : { verifiedAt: model.verifiedAt },
    ...route === undefined ? {} : { route: route.provider },
  }
}

/** Failure raised before HTTP when a selection is not legal for the exact model. */
export class UnsupportedEffortError extends Error {
  /** Stable failure code. */
  readonly code = 'UNSUPPORTED_REASONING_EFFORT'
  /** @param message - actionable explanation. */
  constructor(message: string) {
    super(message)
    this.name = 'UnsupportedEffortError'
  }
}

/**
 * Documented per-model effort aliases for request-level controls. Only
 * mappings with an explicit NanoGPT statement belong here; everything else is
 * sent exactly as advertised.
 */
const EFFORT_ALIASES: Readonly<Record<string, Partial<Record<WireEffort, WireEffort>>>> = {
  'anthropic/claude-fable-5.1': { minimal: 'low' },
}

/**
 * Map an adapter selection to a wire value.
 * `auto`/undefined stay undefined (omit the field); `off` is an explicit
 * compatibility alias for `none`, never a wire spelling of its own.
 */
export function normalizeEffortSelection(
  selection: EffortSelection,
  policy: ReasoningPolicy | undefined,
  modelId: string,
): WireEffort | undefined {
  if (selection === undefined || selection === 'auto') return undefined
  let requested = selection === 'off' ? 'none' : selection
  if (policy === undefined) {
    throw new UnsupportedEffortError(`model "${modelId}" does not support reasoning effort "${selection}"`)
  }
  const alias = EFFORT_ALIASES[modelId]?.[requested]
  if (alias !== undefined && policy.efforts.includes(alias)) requested = alias
  if (!policy.efforts.includes(requested)) {
    if (requested === 'none' && policy.alwaysThinking) {
      throw new UnsupportedEffortError(
        `reasoning cannot be disabled for "${modelId}": this model always reasons. Choose another level or the provider default.`,
      )
    }
    if (requested === 'none' && !policy.efforts.includes('none')) {
      throw new UnsupportedEffortError(
        `reasoning cannot be disabled for "${modelId}": the model does not advertise "none". Choose another level or the provider default.`,
      )
    }
    throw new UnsupportedEffortError(
      `model "${modelId}" does not support reasoning effort "${requested}"; offered: ${policy.efforts.join(', ') || 'provider default only'}`,
    )
  }
  return requested
}

/** Fields a Chat Completions request carries for reasoning. */
export interface ChatReasoningFields {
  reasoning_effort?: WireEffort
  reasoning?: { exclude: true }
}

/** Fields a Responses request carries for reasoning. */
export interface ResponsesReasoningFields {
  reasoning?: { effort?: WireEffort; exclude?: true }
}

/** Fields an Anthropic Messages request carries for reasoning. */
export interface MessagesReasoningFields {
  output_config?: { effort: WireEffort }
  thinking?: { type: 'disabled' }
}

/** The exact reasoning representation one request will send. */
export interface WireReasoning {
  /** Effort value sent on the wire; absent when the provider default is requested. */
  wireEffort?: WireEffort
  /** Whether returned reasoning is explicitly hidden. */
  exclude: boolean
  /** Protocol-specific fields, ready to merge into the request body. */
  fields: ChatReasoningFields | ResponsesReasoningFields | MessagesReasoningFields
}

/**
 * Build the protocol-specific reasoning fields for one request.
 * @param protocol - wire protocol selected for this request.
 * @param selection - DSH selection, including the legacy `off` alias.
 * @param policy - resolved model policy.
 * @param visibility - output visibility setting.
 * @param modelId - exact model id for diagnostics.
 * @returns fields to merge and the actual effort sent.
 */
export function wireReasoning(
  protocol: Protocol,
  selection: EffortSelection,
  policy: ReasoningPolicy | undefined,
  visibility: ReasoningVisibility,
  modelId: string,
): WireReasoning {
  const effort = normalizeEffortSelection(selection, policy, modelId)
  const exclude = visibility === 'hide'
  if (protocol === 'chat') {
    // Chat Completions documents reasoning.exclude for output visibility.
    const fields: ChatReasoningFields = {
      ...effort === undefined ? {} : { reasoning_effort: effort },
      ...exclude ? { reasoning: { exclude: true } } : {},
    }
    return { ...effort === undefined ? {} : { wireEffort: effort }, exclude, fields }
  }
  if (protocol === 'responses') {
    // Responses documents both reasoning.effort and reasoning.exclude.
    const fields: ResponsesReasoningFields = {
      ...effort === undefined && !exclude
        ? {}
        : {
            reasoning: {
              ...effort === undefined ? {} : { effort },
              ...exclude ? { exclude: true as const } : {},
            },
          },
    }
    return { ...effort === undefined ? {} : { wireEffort: effort }, exclude, fields }
  }
  // Anthropic Messages documents output_config.effort (or thinking disabled
  // for none). NanoGPT does not document a hide-only control on this
  // transport, so visibility=hide is not serialized here; the Messages
  // serializer warns instead of inventing a suffix or body field.
  const fields: MessagesReasoningFields =
    effort === 'none'
      ? { thinking: { type: 'disabled' } }
      : effort === undefined
        ? {}
        : { output_config: { effort } }
  return { ...effort === undefined ? {} : { wireEffort: effort }, exclude: false, fields }
}

/** Human-readable label for a resolved source. */
export function capabilitySourceLabel(source: CapabilitySource): string {
  switch (source) {
    case 'api':
      return 'NanoGPT model catalog'
    case 'api-route':
      return 'NanoGPT provider discovery'
    case 'documentation':
      return 'NanoGPT documentation'
    case 'verified':
      return 'Plugin verification record'
    case 'user-config':
      return 'User override'
    case 'inferred':
      return 'Inferred (experimental)'
    case 'unknown':
      return 'Unknown'
  }
}
