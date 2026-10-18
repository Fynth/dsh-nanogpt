/**
 * Shared host-side vocabulary for the NanoGPT provider.
 *
 * The wire effort vocabulary is NanoGPT's documented `reasoning_effort` set.
 * It is deliberately kept separate from DSH's adapter-owned effort identifiers:
 * DSH exposes whatever this adapter advertises, and this module is the single
 * place that maps a selection to the exact string NanoGPT accepts.
 *
 * @module dsh-nanogpt/shared
 */
/** Registered provider route. */
export declare const PROVIDER = "nanogpt";
/** Plugin profile entry id; also the settings namespace advertised to DSH. */
export declare const PLUGIN_NAME = "llm-nanogpt";
/** Human-readable provider name. */
export declare const DISPLAY_NAME = "NanoGPT";
/** Default direct API host documented by NanoGPT. */
export declare const DEFAULT_BASE_URL = "https://api.nano-gpt.com/api/v1";
/** Credential reference resolved when configuration names none. */
export declare const DEFAULT_API_KEY_ENV = "NANOGPT_API_KEY";
/** Documented NanoGPT reasoning-effort vocabulary, in escalation order. */
export declare const WIRE_EFFORTS: readonly ["none", "minimal", "low", "medium", "high", "xhigh", "max"];
/** One value NanoGPT accepts in `reasoning_effort` / `reasoning.effort`. */
export type WireEffort = (typeof WIRE_EFFORTS)[number];
/** Wire protocols this adapter can speak. */
export declare const PROTOCOLS: readonly ["chat", "responses", "messages"];
/** One supported wire protocol. */
export type Protocol = (typeof PROTOCOLS)[number];
/** How reasoning content is rendered by NanoGPT's transport variants. */
export declare const VISIBILITIES: readonly ["show", "hide"];
/** Whether returned reasoning is shown to the user. */
export type ReasoningVisibility = (typeof VISIBILITIES)[number];
/** Model-specific capability provenance, shown in the settings UI. */
export declare const CAPABILITY_SOURCES: readonly ["api", "api-route", "documentation", "verified", "user-config", "inferred", "unknown"];
/** Where a capability fact came from. */
export type CapabilitySource = (typeof CAPABILITY_SOURCES)[number];
/** Normalized price per million tokens in USD. */
export interface PricePerMillion {
    /** Uncached input tokens, USD per 1,000,000 tokens. */
    input?: number;
    /** Output tokens, USD per 1,000,000 tokens. */
    output?: number;
    /** Cache-read input tokens, USD per 1,000,000 tokens. */
    cacheRead?: number;
    /** Cache-write input tokens, USD per 1,000,000 tokens. */
    cacheWrite?: number;
}
/** One normalized model discovered from NanoGPT or declared by configuration. */
export interface CatalogModel {
    /** Exact upstream model id; never rewritten before routing (routing suffixes are additive). */
    id: string;
    /** Human-readable catalog name, falling back to the id. */
    name: string;
    /** Catalog description, sanitized for plain-text UI rendering. */
    description?: string;
    /** Owning provider/family token from the catalog (`owned_by`). */
    provider?: string;
    /** Combined request and response context capacity, when disclosed. */
    contextWindow?: number;
    /** Maximum output tokens, when disclosed. */
    maxOutputTokens?: number;
    /** DSH-compatible input modalities; absent means unknown. */
    inputModalities?: readonly ('text' | 'image')[];
    /** Catalog vision flag; absent means unknown. */
    vision?: boolean;
    /** Catalog video-input flag. */
    videoInput?: boolean;
    /** Catalog audio-input flag. */
    audioInput?: boolean;
    /** Catalog PDF/document-input flag. */
    pdfUpload?: boolean;
    /** Catalog reasoning flag; absent means unknown. */
    reasoning?: boolean;
    /** Exact reasoning-effort values the catalog advertises for this model. */
    reasoningEfforts?: readonly WireEffort[];
    /** Catalog tool-calling flag. */
    toolCalling?: boolean;
    /** Catalog parallel-tool-call flag. */
    parallelToolCalls?: boolean;
    /** Catalog structured-output flag. */
    structuredOutput?: boolean;
    /** Service tiers the catalog advertises. */
    serviceTiers: readonly string[];
    /** Normalized Auto pricing. */
    pricing?: PricePerMillion;
    /** Raw pricing provenance (`list`, `effective`, ...). */
    pricingSource?: string;
    /** Pricing currency, when reported. */
    currency?: string;
    /** Whether this model is included in a subscription, when disclosed. */
    subscriptionIncluded?: boolean;
    /** Subscription input-token multiplier, when disclosed. */
    subscriptionInputMultiplier?: number;
    /** Subscription note, when disclosed. */
    subscriptionNote?: string;
    /** Catalog category. */
    category?: string;
    /** Whether the model weights are open. */
    openWeights?: boolean;
    /** Alias identifiers accepted for this model. */
    aliases: readonly string[];
    /** Public provider ids from the catalog listing. */
    providers: readonly string[];
    /** Capability provenance. */
    source: CapabilitySource;
    /** When the capability facts were fetched or declared. */
    verifiedAt?: string;
    /** Model supports provider selection, when a provider-discovery answer said so. */
    supportsProviderSelection?: boolean;
}
/** Normalized catalog snapshot. */
export interface CatalogSnapshot {
    /** Snapshot format version. */
    version: 1;
    /** Endpoint the snapshot came from. */
    endpoint: string;
    /** When the successful fetch completed. */
    fetchedAt: string;
    /** Source of this snapshot. */
    source: 'api' | 'cache';
    /** Models normalized from the catalog listing. */
    models: readonly CatalogModel[];
    /** Total records in the endpoint answer, including non-chat records. */
    rawCount: number;
    /** Stable content hash used for change detection. */
    hash: string;
}
/** Catalog status for the settings UI. */
export interface CatalogStatus {
    /** `ready`, `loading`, `error` or `empty`. */
    status: 'ready' | 'loading' | 'error' | 'empty';
    /** Where the current snapshot came from. */
    source?: 'api' | 'cache';
    /** Snapshot endpoint. */
    endpoint?: string;
    /** When the current snapshot was fetched. */
    fetchedAt?: string;
    /** Age of the snapshot in milliseconds. */
    ageMs?: number;
    /** Whether the snapshot is older than the freshness window. */
    stale: boolean;
    /** Number of chat-capable models in the snapshot. */
    chatModels: number;
    /** Number of records in the endpoint answer. */
    rawModels: number;
    /** Last refresh failure, retained beside a usable snapshot. */
    error?: {
        code: string;
        message: string;
        at: string;
    };
    /** Whether a refresh is in flight. */
    refreshing: boolean;
}
/** One public provider route from NanoGPT's provider-discovery endpoint. */
export interface ProviderRoute {
    /** Public provider id accepted in `X-Provider` / body `provider`. */
    id: string;
    /** Display name, when disclosed. */
    displayName?: string;
    /** Whether the route is currently available. */
    available: boolean;
    /** Maximum input tokens on this route. */
    maxInputTokens?: number;
    /** Maximum output tokens on this route. */
    maxOutputTokens?: number;
    /** Exact reasoning efforts the route accepts. */
    reasoningEfforts?: readonly WireEffort[];
    /** Whether thinking cannot be disabled on this route. */
    reasoningAlwaysOn?: boolean;
    /** Tool-calling support. */
    supportsTools?: boolean;
    /** Image-input support. */
    supportsImages?: boolean;
    /** Prompt-caching support. */
    supportsPromptCaching?: boolean;
    /** Structured-output support. */
    supportsStructuredOutput?: boolean;
    /** Quantization. */
    quantization?: string;
    /** Recent output speed, tokens/second. */
    tps?: number;
    /** Recent time to first token, milliseconds. */
    ttftMs?: number;
    /** Normalized route pricing (already includes selection markup). */
    pricing?: PricePerMillion;
    /** Route currency. */
    currency?: string;
    /** Privacy mode. */
    privacy?: string;
    /** Region. */
    region?: string;
    /** Upstream provider selection markup has been folded into `pricing`. */
    priceIncludesMarkup?: boolean;
}
/** Provider-discovery result for one exact model. */
export interface ProviderCatalog {
    /** Exact model id queried. */
    model: string;
    /** Display name from the provider answer. */
    displayName?: string;
    /** Whether the model supports explicit provider selection. */
    supportsProviderSelection: boolean;
    /** Default (Auto) pricing. */
    defaultPricing?: PricePerMillion;
    /** Route rows. */
    providers: readonly ProviderRoute[];
    /** When this answer was fetched. */
    fetchedAt: string;
    /** Where the answer came from. */
    source: 'api' | 'cache';
}
/** Classified failure the RPC layer can return without leaking secrets. */
export interface FailureInfo {
    /** Stable machine code. */
    code: string;
    /** Human-readable message; never contains the API key. */
    message: string;
    /** HTTP status, when one was received. */
    status?: number;
    /** Provider-issued request id, when one was received. */
    requestId?: string;
    /** Provider-requested retry delay in milliseconds. */
    retryAfterMs?: number;
    /** NanoGPT machine code, when present. */
    providerCode?: string;
}
/** One safe diagnostic entry for the settings page. */
export interface RequestDiagnostic {
    /** When the request settled. */
    at: string;
    /** Registered route. */
    provider: string;
    /** Exact model id. */
    model: string;
    /** Wire protocol. */
    protocol: Protocol;
    /** Effort selected by DSH, when one was selected. */
    requestedEffort?: string;
    /** Effort actually serialized, when one was sent. */
    wireEffort?: string;
    /** HTTP status, when a response arrived. */
    status?: number;
    /** Whether the request streamed. */
    streamed: boolean;
    /** Provider-issued request id. */
    requestId?: string;
    /** Time from dispatch to response headers, milliseconds. */
    headerMs?: number;
    /** Total stream duration, milliseconds. */
    durationMs?: number;
    /** Normalized token usage, when reported. */
    usage?: {
        inputTokens?: number;
        outputTokens?: number;
        reasoningTokens?: number;
        cacheReadTokens?: number;
        cacheWriteTokens?: number;
        totalTokens?: number;
    };
    /** Provider-reported primary charge, when disclosed. */
    costUsd?: number;
    /** Failure category, when the request failed. */
    failure?: FailureInfo;
}
