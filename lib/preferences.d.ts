import { type AdvancedConfig, type ResolvedModelOverride, type RoutingConfig } from './config.js';
import { type CapabilitySource, type Protocol, type ReasoningVisibility, type WireEffort } from './shared.js';
/** Hard caps that keep a hostile or corrupted document from exhausting memory. */
export declare const MAX_LIST_ENTRIES = 10000;
export declare const MAX_MODEL_OVERRIDES = 5000;
/** One model-level user preference. */
export interface ModelPreference {
    /** Retire the model from the picker. */
    enabled?: boolean;
    /** Display-name override. */
    name?: string;
    /** Context-capacity override. */
    contextWindow?: number;
    /** Output-token cap override. */
    maxOutputTokens?: number;
    /** Input modalities override. */
    inputModalities?: readonly ('text' | 'image')[];
    /** Explicit supported efforts. */
    reasoningEfforts?: readonly WireEffort[];
    /** Declare the model non-reasoning. */
    reasoningDisabled?: boolean;
    /** Default effort, or `auto`. */
    defaultEffort?: WireEffort | 'auto';
    /** Protocol override. */
    protocol?: Protocol;
    /** Routing override. */
    routing?: RoutingConfig;
    /** Advanced override. */
    advanced?: AdvancedConfig;
    /** Provenance label for the override. */
    source?: CapabilitySource;
    /** User note. */
    notes?: string;
}
/** UI state that should survive a restart. */
export interface UiPreferences {
    /** Last active tab. */
    tab?: string;
    /** Whether hidden models are listed in the browser. */
    showHidden?: boolean;
    /** Model browser sort key. */
    sort?: 'name' | 'context' | 'input-price' | 'output-price' | 'provider';
    /** Model browser provider filter. */
    providerFilter?: string;
    /** Whether experimental effort values may be selected. */
    experimental?: boolean;
}
/** The complete preferences document. */
export interface Preferences {
    version: 1;
    /** Monotonic revision used for optimistic concurrency. */
    revision: number;
    /** Last write instant. */
    updatedAt: string;
    /** Model selected for new sessions, when one is pinned. */
    defaultModel?: string;
    /** Default effort for new sessions, or `auto`. */
    defaultReasoningEffort?: WireEffort | 'auto';
    /** User-visible reasoning output policy; deployment config is the fallback. */
    reasoningVisibility?: ReasoningVisibility;
    /** Favorite model ids, in user order. */
    favorites: string[];
    /** Hidden model ids. */
    hidden: string[];
    /** Pinned model ids, shown first. */
    pinned: string[];
    /** Per-model overrides. */
    models: Record<string, ModelPreference>;
    /** User routing defaults. */
    routing?: RoutingConfig;
    /** User advanced defaults. */
    advanced?: AdvancedConfig;
    /** UI state. */
    ui: UiPreferences;
}
/** Patch accepted by {@link PreferencesStore.update}. */
export interface PreferencesPatch {
    defaultModel?: string | null;
    defaultReasoningEffort?: string | null;
    reasoningVisibility?: string | null;
    favorites?: string[];
    hidden?: string[];
    pinned?: string[];
    models?: Record<string, Partial<ModelPreference> | null>;
    routing?: RoutingConfig | null;
    advanced?: AdvancedConfig | null;
    ui?: Partial<UiPreferences>;
}
/** Stable preference failure. */
export declare class PreferencesError extends Error {
    readonly code: string;
    /** @param message - safe explanation. @param code - machine code. */
    constructor(message: string, code: string);
}
/** Default document. */
export declare function defaultPreferences(now?: string): Preferences;
/** Default preferences file path. */
export declare function defaultPreferencesPath(): string;
/** Normalize one model preference without throwing away unrelated fields. */
export declare function normalizeModelPreference(raw: unknown): ModelPreference | undefined;
/** Normalize a complete preferences document, migrating older shapes. */
export declare function normalizePreferences(raw: unknown, now?: string): Preferences;
/** Convert user preferences into adapter overrides for one operation. */
export declare function preferenceOverrides(preferences: Preferences): ResolvedModelOverride[];
/** One preference store write outcome. */
export interface PreferencesWriteResult {
    preferences: Preferences;
    changed: boolean;
}
/** Persistent preferences store with optimistic revision checks. */
export declare class PreferencesStore {
    private document;
    private readonly path;
    private readonly now;
    private queue;
    private loaded;
    /** @param options - path and clock overrides for tests. */
    constructor(options?: {
        path?: string;
        now?: () => Date;
    });
    /** Current in-memory document. */
    current(): Preferences;
    /** Path this store owns. */
    filePath(): string;
    /** Load the document once; a malformed file is preserved beside the live path. */
    load(): Promise<Preferences>;
    /**
     * Keep a corrupt document for recovery instead of letting the first write
     * overwrite it. The live path is then free for the normalized defaults.
     */
    private preserveUnreadable;
    /** Serialize one write behind any pending write. */
    private enqueue;
    /** Write the document atomically. */
    private persist;
    /**
     * Merge a patch into the document.
     * @param patch - partial changes; `null` clears a top-level field or a model override.
     * @param expectedRevision - revision the caller read; a mismatch is refused.
     * @returns the committed document.
     */
    update(patch: PreferencesPatch, expectedRevision?: number): Promise<PreferencesWriteResult>;
    /** Replace the document from an imported file, validating every field. */
    import(raw: unknown, expectedRevision?: number): Promise<PreferencesWriteResult>;
    /** Safe export document; contains no credentials and no deployment endpoint. */
    export(): string;
}
