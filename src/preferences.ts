/**
 * Versioned, plugin-owned user preferences.
 *
 * Deployment facts stay in `cordis.patch.yml`; this store holds the choices a
 * user makes in Settings → NanoGPT: default model, favorites, hidden models,
 * per-model reasoning/protocol/routing overrides, and UI state. The file is
 * written atomically under the harness home, carries a schema version and a
 * revision for conflict detection, and never contains a credential.
 *
 * @module dsh-nanogpt/preferences
 */
import { readFile, rename } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshHomePath } from '@deepseek-ai/dsh-home-paths'
import { isRecord, optionalString } from './catalog.js'
import {
  resolveAdvanced,
  resolveModelOverride,
  resolveRouting,
  type AdvancedConfig,
  type ResolvedModelOverride,
  type RoutingConfig,
} from './config.js'
import {
  PROTOCOLS,
  WIRE_EFFORTS,
  type CapabilitySource,
  type Protocol,
  type ReasoningVisibility,
  type WireEffort,
} from './shared.js'

/** Hard caps that keep a hostile or corrupted document from exhausting memory. */
export const MAX_LIST_ENTRIES = 10_000
export const MAX_MODEL_OVERRIDES = 5_000

/** One model-level user preference. */
export interface ModelPreference {
  /** Retire the model from the picker. */
  enabled?: boolean
  /** Display-name override. */
  name?: string
  /** Context-capacity override. */
  contextWindow?: number
  /** Output-token cap override. */
  maxOutputTokens?: number
  /** Input modalities override. */
  inputModalities?: readonly ('text' | 'image')[]
  /** Explicit supported efforts. */
  reasoningEfforts?: readonly WireEffort[]
  /** Declare the model non-reasoning. */
  reasoningDisabled?: boolean
  /** Default effort, or `auto`. */
  defaultEffort?: WireEffort | 'auto'
  /** Protocol override. */
  protocol?: Protocol
  /** Routing override. */
  routing?: RoutingConfig
  /** Advanced override. */
  advanced?: AdvancedConfig
  /** Provenance label for the override. */
  source?: CapabilitySource
  /** User note. */
  notes?: string
}

/** UI state that should survive a restart. */
export interface UiPreferences {
  /** Last active tab. */
  tab?: string
  /** Whether hidden models are listed in the browser. */
  showHidden?: boolean
  /** Model browser sort key. */
  sort?: 'name' | 'context' | 'input-price' | 'output-price' | 'provider'
  /** Model browser provider filter. */
  providerFilter?: string
  /** Whether experimental effort values may be selected. */
  experimental?: boolean
}

/** The complete preferences document. */
export interface Preferences {
  version: 1
  /** Monotonic revision used for optimistic concurrency. */
  revision: number
  /** Last write instant. */
  updatedAt: string
  /** Model selected for new sessions, when one is pinned. */
  defaultModel?: string
  /** Default effort for new sessions, or `auto`. */
  defaultReasoningEffort?: WireEffort | 'auto'
  /** User-visible reasoning output policy; deployment config is the fallback. */
  reasoningVisibility?: ReasoningVisibility
  /** Favorite model ids, in user order. */
  favorites: string[]
  /** Hidden model ids. */
  hidden: string[]
  /** Pinned model ids, shown first. */
  pinned: string[]
  /** Per-model overrides. */
  models: Record<string, ModelPreference>
  /** User routing defaults. */
  routing?: RoutingConfig
  /** User advanced defaults. */
  advanced?: AdvancedConfig
  /** UI state. */
  ui: UiPreferences
}

/** Patch accepted by {@link PreferencesStore.update}. */
export interface PreferencesPatch {
  defaultModel?: string | null
  defaultReasoningEffort?: string | null
  reasoningVisibility?: string | null
  favorites?: string[]
  hidden?: string[]
  pinned?: string[]
  models?: Record<string, Partial<ModelPreference> | null>
  routing?: RoutingConfig | null
  advanced?: AdvancedConfig | null
  ui?: Partial<UiPreferences>
}

/** Stable preference failure. */
export class PreferencesError extends Error {
  /** @param message - safe explanation. @param code - machine code. */
  constructor(message: string, readonly code: string) {
    super(message)
    this.name = 'PreferencesError'
  }
}

/** Default document. */
export function defaultPreferences(now = new Date().toISOString()): Preferences {
  return {
    version: 1,
    revision: 1,
    updatedAt: now,
    favorites: [],
    hidden: [],
    pinned: [],
    models: {},
    ui: { sort: 'name' },
  }
}

/** Default preferences file path. */
export function defaultPreferencesPath(): string {
  return dshHomePath('storages', 'dsh-nanogpt', 'preferences.json')
}

/** Read a non-empty string array with stable deduplication. */
function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  const seen = new Set<string>()
  for (const entry of value) {
    if (typeof entry !== 'string') continue
    const trimmed = entry.trim()
    if (trimmed.length === 0 || trimmed.length > 200 || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
    if (result.length >= MAX_LIST_ENTRIES) break
  }
  return result
}

/**
 * Refuse object-prototype spellings as model ids. A user-supplied JSON
 * document can carry an own "__proto__" key; assigning it to a plain record
 * would mutate the record's prototype instead of adding a model.
 */
function unsafeModelId(id: string): boolean {
  return id === '__proto__' || id === 'prototype' || id === 'constructor'
}

/** Normalize an effort value, treating the legacy `off` alias as `none`. */
function normalizeEffortValue(value: unknown): WireEffort | 'auto' | 'off' | undefined {
  if (value === undefined || value === null) return undefined
  if (value === 'auto' || value === 'off') return value
  if (typeof value === 'string' && (WIRE_EFFORTS as readonly string[]).includes(value)) return value as WireEffort
  return undefined
}

/** Normalize one model preference without throwing away unrelated fields. */
export function normalizeModelPreference(raw: unknown): ModelPreference | undefined {
  if (!isRecord(raw)) return undefined
  let efforts: WireEffort[] | undefined
  if (Array.isArray(raw.reasoningEfforts)) {
    const set = new Set<WireEffort>()
    for (const value of raw.reasoningEfforts) {
      if (typeof value === 'string' && (WIRE_EFFORTS as readonly string[]).includes(value)) set.add(value as WireEffort)
    }
    efforts = WIRE_EFFORTS.filter((effort) => set.has(effort))
    if (efforts.length === 0) efforts = undefined
  }
  const defaultEffortRaw = normalizeEffortValue(raw.defaultEffort)
  let defaultEffort: WireEffort | 'auto' | undefined
  if (defaultEffortRaw === 'auto') defaultEffort = 'auto'
  else if (defaultEffortRaw === 'off') defaultEffort = efforts?.includes('none') === false ? undefined : 'none'
  else defaultEffort = defaultEffortRaw
  if (defaultEffort !== undefined && defaultEffort !== 'auto' && efforts !== undefined && !efforts.includes(defaultEffort)) {
    defaultEffort = undefined
  }
  const protocol = typeof raw.protocol === 'string' && (PROTOCOLS as readonly string[]).includes(raw.protocol) ? (raw.protocol as Protocol) : undefined
  let routing: RoutingConfig | undefined
  try {
    routing = raw.routing === undefined ? undefined : resolveRouting(raw.routing as RoutingConfig)
  } catch {
    routing = undefined
  }
  let advanced: AdvancedConfig | undefined
  try {
    advanced = raw.advanced === undefined ? undefined : resolveAdvanced(raw.advanced as AdvancedConfig)
  } catch {
    advanced = undefined
  }
  const modalities = Array.isArray(raw.inputModalities)
    ? [...new Set(raw.inputModalities.filter((entry): entry is 'text' | 'image' => entry === 'text' || entry === 'image'))]
    : undefined
  const name = optionalString(raw.name)?.slice(0, 200)
  const notes = optionalString(raw.notes)?.slice(0, 2_000)
  return {
    ...typeof raw.enabled === 'boolean' ? { enabled: raw.enabled } : {},
    ...name === undefined ? {} : { name },
    ...typeof raw.contextWindow === 'number' && Number.isInteger(raw.contextWindow) && raw.contextWindow > 0
      ? { contextWindow: raw.contextWindow }
      : {},
    ...typeof raw.maxOutputTokens === 'number' && Number.isInteger(raw.maxOutputTokens) && raw.maxOutputTokens > 0
      ? { maxOutputTokens: raw.maxOutputTokens }
      : {},
    ...modalities === undefined || modalities.length === 0 ? {} : { inputModalities: modalities },
    ...efforts === undefined ? {} : { reasoningEfforts: efforts },
    ...raw.reasoningDisabled === true ? { reasoningDisabled: true } : {},
    ...defaultEffort === undefined ? {} : { defaultEffort },
    ...protocol === undefined ? {} : { protocol },
    ...routing === undefined ? {} : { routing },
    ...advanced === undefined ? {} : { advanced },
    ...raw.source === 'api' || raw.source === 'api-route' || raw.source === 'documentation' || raw.source === 'verified' || raw.source === 'user-config' || raw.source === 'inferred' || raw.source === 'unknown'
      ? { source: raw.source }
      : { source: 'user-config' as const },
    ...notes === undefined ? {} : { notes },
  }
}

/** Normalize a complete preferences document, migrating older shapes. */
export function normalizePreferences(raw: unknown, now = new Date().toISOString()): Preferences {
  if (!isRecord(raw)) return defaultPreferences(now)
  const revision =
    typeof raw.revision === 'number' && Number.isFinite(raw.revision) && raw.revision >= 1 ? Math.floor(raw.revision) : 1
  let defaultReasoningEffort = normalizeEffortValue(raw.defaultReasoningEffort)
  if (defaultReasoningEffort === 'off') defaultReasoningEffort = 'none'
  const models: Record<string, ModelPreference> = {}
  if (isRecord(raw.models)) {
    for (const [id, value] of Object.entries(raw.models)) {
      const cleanId = id.trim()
      if (cleanId.length === 0 || cleanId.length > 200 || unsafeModelId(cleanId)) continue
      const normalized = normalizeModelPreference(value)
      if (normalized !== undefined) models[cleanId] = normalized
      if (Object.keys(models).length >= MAX_MODEL_OVERRIDES) break
    }
  }
  let routing: RoutingConfig | undefined
  try {
    routing = raw.routing === undefined ? undefined : resolveRouting(raw.routing as RoutingConfig)
  } catch {
    routing = undefined
  }
  let advanced: AdvancedConfig | undefined
  try {
    advanced = raw.advanced === undefined ? undefined : resolveAdvanced(raw.advanced as AdvancedConfig)
  } catch {
    advanced = undefined
  }
  const uiRaw = isRecord(raw.ui) ? raw.ui : {}
  const tab = optionalString(uiRaw.tab)
  const sort = uiRaw.sort === 'context' || uiRaw.sort === 'input-price' || uiRaw.sort === 'output-price' || uiRaw.sort === 'provider' || uiRaw.sort === 'name' ? uiRaw.sort : 'name'
  const providerFilter = optionalString(uiRaw.providerFilter)
  const defaultModel = optionalString(raw.defaultModel)
  const reasoningVisibility =
    raw.reasoningVisibility === 'show' || raw.reasoningVisibility === 'hide'
      ? raw.reasoningVisibility
      : undefined
  return {
    version: 1,
    revision,
    updatedAt: optionalString(raw.updatedAt) ?? now,
    ...defaultModel === undefined ? {} : { defaultModel },
    ...defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort },
    ...reasoningVisibility === undefined ? {} : { reasoningVisibility },
    favorites: stringArray(raw.favorites),
    hidden: stringArray(raw.hidden),
    pinned: stringArray(raw.pinned),
    models,
    ...routing === undefined ? {} : { routing },
    ...advanced === undefined ? {} : { advanced },
    ui: {
      ...tab === undefined ? {} : { tab },
      ...typeof uiRaw.showHidden === 'boolean' ? { showHidden: uiRaw.showHidden } : {},
      sort,
      ...providerFilter === undefined ? {} : { providerFilter },
      ...typeof uiRaw.experimental === 'boolean' ? { experimental: uiRaw.experimental } : {},
    },
  }
}

/** Convert user preferences into adapter overrides for one operation. */
export function preferenceOverrides(preferences: Preferences): ResolvedModelOverride[] {
  const overrides: ResolvedModelOverride[] = []
  for (const [id, preference] of Object.entries(preferences.models)) {
    try {
      overrides.push(
        resolveModelOverride({
          id,
          ...preference.name === undefined ? {} : { name: preference.name },
          ...preference.enabled === undefined ? {} : { enabled: preference.enabled },
          ...preference.contextWindow === undefined ? {} : { contextWindow: preference.contextWindow },
          ...preference.maxOutputTokens === undefined ? {} : { maxTokens: preference.maxOutputTokens },
          ...preference.inputModalities === undefined ? {} : { inputModalities: preference.inputModalities },
          ...preference.reasoningDisabled === true
            ? { reasoningEfforts: false as const }
            : preference.reasoningEfforts === undefined
              ? {}
              : { reasoningEfforts: preference.reasoningEfforts },
          ...preference.defaultEffort === undefined ? {} : { defaultEffort: preference.defaultEffort },
          ...preference.protocol === undefined ? {} : { protocol: preference.protocol },
          ...preference.routing === undefined ? {} : { routing: preference.routing },
          ...preference.advanced === undefined ? {} : { advanced: preference.advanced },
          source: preference.source ?? 'user-config',
          ...preference.notes === undefined ? {} : { notes: preference.notes },
        }),
      )
    } catch {
      // An invalid stored override is ignored; the catalog model stays usable.
    }
  }
  return overrides
}

/** One preference store write outcome. */
export interface PreferencesWriteResult {
  preferences: Preferences
  changed: boolean
}

/** Persistent preferences store with optimistic revision checks. */
export class PreferencesStore {
  private document: Preferences
  private readonly path: string
  private readonly now: () => Date
  private queue: Promise<unknown> = Promise.resolve()
  private loaded = false

  /** @param options - path and clock overrides for tests. */
  constructor(options: { path?: string; now?: () => Date } = {}) {
    this.path = options.path ?? defaultPreferencesPath()
    this.now = options.now ?? (() => new Date())
    this.document = defaultPreferences(this.now().toISOString())
  }

  /** Current in-memory document. */
  current(): Preferences {
    return this.document
  }

  /** Path this store owns. */
  filePath(): string {
    return this.path
  }

  /** Load the document once; a malformed file is preserved beside the live path. */
  async load(): Promise<Preferences> {
    if (this.loaded) return this.document
    this.loaded = true
    let text: string
    try {
      text = await readFile(this.path, 'utf8')
    } catch {
      return this.document
    }
    if (text.length > 8 * 1024 * 1024) {
      await this.preserveUnreadable()
      throw new PreferencesError('preferences file is too large', 'INVALID_PREFERENCES')
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      await this.preserveUnreadable()
      throw new PreferencesError('preferences file is not valid JSON', 'INVALID_PREFERENCES')
    }
    this.document = normalizePreferences(raw, this.now().toISOString())
    return this.document
  }

  /**
   * Keep a corrupt document for recovery instead of letting the first write
   * overwrite it. The live path is then free for the normalized defaults.
   */
  private async preserveUnreadable(): Promise<void> {
    try {
      await rename(this.path, `${this.path}.corrupt-${this.now().toISOString().replace(/[:.]/g, '-')}`)
    } catch {
      // A read-only or already-moved file is not fatal; the error below still
      // tells the user the document could not be loaded.
    }
  }

  /** Serialize one write behind any pending write. */
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.queue.then(operation, operation)
    this.queue = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  /** Write the document atomically. */
  private async persist(): Promise<void> {
    await writeFileAtomic(this.path, `${JSON.stringify(this.document, null, 2)}\n`, { mode: 0o600, dirMode: 0o700 })
  }

  /**
   * Merge a patch into the document.
   * @param patch - partial changes; `null` clears a top-level field or a model override.
   * @param expectedRevision - revision the caller read; a mismatch is refused.
   * @returns the committed document.
   */
  update(patch: PreferencesPatch, expectedRevision?: number): Promise<PreferencesWriteResult> {
    return this.enqueue(async () => {
      if (expectedRevision !== undefined && expectedRevision !== this.document.revision) {
        throw new PreferencesError(
          `preferences changed concurrently (expected revision ${expectedRevision}, current ${this.document.revision}); reload and try again`,
          'STALE_REVISION',
        )
      }
      const next: Preferences = {
        ...this.document,
        revision: this.document.revision + 1,
        updatedAt: this.now().toISOString(),
        favorites: patch.favorites === undefined ? this.document.favorites : stringArray(patch.favorites),
        hidden: patch.hidden === undefined ? this.document.hidden : stringArray(patch.hidden),
        pinned: patch.pinned === undefined ? this.document.pinned : stringArray(patch.pinned),
        models: { ...this.document.models },
        ui: { ...this.document.ui, ...patch.ui ?? {} },
      }
      if (patch.defaultModel !== undefined) {
        if (patch.defaultModel === null) delete next.defaultModel
        else {
          const value = patch.defaultModel.trim()
          if (value.length === 0) delete next.defaultModel
          else next.defaultModel = value.slice(0, 200)
        }
      }
      if (patch.defaultReasoningEffort !== undefined) {
        if (patch.defaultReasoningEffort === null) delete next.defaultReasoningEffort
        else {
          const value = normalizeEffortValue(patch.defaultReasoningEffort)
          if (value === undefined) throw new PreferencesError(`unknown default reasoning effort "${patch.defaultReasoningEffort}"`, 'INVALID_PREFERENCES')
          next.defaultReasoningEffort = value === 'off' ? 'none' : value
        }
      }
      if (patch.reasoningVisibility !== undefined) {
        if (patch.reasoningVisibility === null) delete next.reasoningVisibility
        else if (patch.reasoningVisibility === 'show' || patch.reasoningVisibility === 'hide') {
          next.reasoningVisibility = patch.reasoningVisibility
        } else {
          throw new PreferencesError(`unknown reasoning visibility "${patch.reasoningVisibility}"`, 'INVALID_PREFERENCES')
        }
      }
      if (patch.routing !== undefined) {
        if (patch.routing === null) delete next.routing
        else next.routing = resolveRouting(patch.routing)
      }
      if (patch.advanced !== undefined) {
        if (patch.advanced === null) delete next.advanced
        else next.advanced = resolveAdvanced(patch.advanced)
      }
      if (patch.models !== undefined) {
        let modelCount = Object.keys(next.models).length
        for (const [id, value] of Object.entries(patch.models)) {
          const cleanId = id.trim()
          if (cleanId.length === 0 || cleanId.length > 200) {
            throw new PreferencesError(`invalid model id "${id.slice(0, 40)}"`, 'INVALID_PREFERENCES')
          }
          if (unsafeModelId(cleanId)) {
            throw new PreferencesError(`reserved model id "${cleanId}"`, 'INVALID_PREFERENCES')
          }
          if (value === null) {
            if (cleanId in next.models) {
              delete next.models[cleanId]
              modelCount -= 1
            }
            continue
          }
          const merged = normalizeModelPreference({ ...next.models[cleanId], ...value })
          if (merged === undefined) throw new PreferencesError(`invalid model preference for "${cleanId}"`, 'INVALID_PREFERENCES')
          if (!(cleanId in next.models)) modelCount += 1
          if (modelCount > MAX_MODEL_OVERRIDES) {
            throw new PreferencesError(`too many model overrides (limit ${MAX_MODEL_OVERRIDES})`, 'INVALID_PREFERENCES')
          }
          next.models[cleanId] = merged
        }
      }
      const previous = this.document
      this.document = next
      try {
        await this.persist()
      } catch (error) {
        this.document = previous
        throw new PreferencesError(
          `could not write preferences: ${error instanceof Error ? error.message : 'unknown error'}`,
          'WRITE_FAILED',
        )
      }
      return { preferences: next, changed: true }
    })
  }

  /** Replace the document from an imported file, validating every field. */
  import(raw: unknown, expectedRevision?: number): Promise<PreferencesWriteResult> {
    return this.enqueue(async () => {
      if (expectedRevision !== undefined && expectedRevision !== this.document.revision) {
        throw new PreferencesError(
          `preferences changed concurrently (expected revision ${expectedRevision}, current ${this.document.revision}); reload and try again`,
          'STALE_REVISION',
        )
      }
      if (!isRecord(raw)) throw new PreferencesError('imported preferences must be a JSON object', 'INVALID_PREFERENCES')
      const forbidden = ['apiKey', 'api_key', 'key', 'token', 'baseURL', 'apiKeyEnv']
      for (const key of forbidden) {
        if (key in raw) throw new PreferencesError(`imported preferences must not contain "${key}"`, 'INVALID_PREFERENCES')
      }
      const normalized = normalizePreferences(raw, this.now().toISOString())
      normalized.revision = this.document.revision + 1
      if (JSON.stringify(normalized).length > 8 * 1024 * 1024) {
        throw new PreferencesError('imported preferences exceed the 8 MiB document limit', 'INVALID_PREFERENCES')
      }
      const previous = this.document
      this.document = normalized
      try {
        await this.persist()
      } catch (error) {
        this.document = previous
        throw new PreferencesError(
          `could not write preferences: ${error instanceof Error ? error.message : 'unknown error'}`,
          'WRITE_FAILED',
        )
      }
      return { preferences: normalized, changed: true }
    })
  }

  /** Safe export document; contains no credentials and no deployment endpoint. */
  export(): string {
    const safe: Preferences = {
      ...this.document,
      updatedAt: this.now().toISOString(),
    }
    return `${JSON.stringify(safe, null, 2)}\n`
  }
}
