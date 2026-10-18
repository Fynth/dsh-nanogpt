/**
 * Plugin configuration: connection facts, deployment-level model overrides,
 * routing defaults, and advanced request controls.
 *
 * User-facing preferences (favorites, hidden models, per-model routing and
 * effort choices) live in the versioned preferences store, not here; this
 * configuration is the deployment layer a profile's `cordis.patch.yml` owns.
 * Every field that can change without re-registering the route is volatile, so
 * a settings write or HMR config update reaches the next request.
 *
 * @module dsh-nanogpt/config
 */
import type { Volatile } from '@deepseek-ai/cordis';
import { type CredentialRef } from '@deepseek-ai/dsh-credentials';
import { type ResolvedRetryPolicy, type RetryPolicyConfig } from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
import { PROVIDER, type CapabilitySource, type Protocol, type ReasoningVisibility, type WireEffort } from './shared.js';
/** Routing goal for provider-selection-capable models. */
export declare const ROUTING_MODES: readonly ["auto", "speed", "throughput", "latency", "price", "provider"];
/** One provider-routing mode. */
export type RoutingMode = (typeof ROUTING_MODES)[number];
/** Service tiers documented across the three NanoGPT transports. */
export declare const SERVICE_TIERS: readonly ["auto", "default", "standard", "flex", "fast", "priority", "ultrafast", "batch"];
/** One service tier selection. */
export type ServiceTier = (typeof SERVICE_TIERS)[number];
/** Billing modes the API documents. */
export declare const BILLING_MODES: readonly ["default", "paygo"];
/** One billing mode. */
export type BillingMode = (typeof BILLING_MODES)[number];
/** Documented web-search suffix choices exposed in the UI. */
export declare const WEB_SEARCH_MODES: readonly ["off", "online", "online/native", "online/linkup", "online/linkup-deep", "online/tavily", "online/tavily-deep", "online/brave", "online/brave-deep", "online/sofya", "online/exa-fast", "online/exa-auto", "online/exa-neural", "online/exa-deep", "online/exa-deep-reasoning", "online/exa-instant", "online/kagi", "online/kagi-web", "online/kagi-news", "online/kagi-search", "online/perplexity", "online/perplexity-deep", "online/valyu", "online/valyu-deep", "online/valyu-web", "online/valyu-web-deep", "online/firecrawl", "online/firecrawl-deep"];
/** One web-search selection. */
export type WebSearchMode = (typeof WEB_SEARCH_MODES)[number];
/** Routing controls accepted by the plugin. */
export interface RoutingConfig {
    /** Automatic routing, a documented routing goal, or an explicit provider. */
    mode: RoutingMode;
    /** Public provider id for `mode: 'provider'`. */
    provider?: string;
    /** Whether cross-provider fallback is permitted. */
    allowFallbacks?: boolean;
    /** Prefer a cache-capable route (`caching: true`). */
    caching?: boolean;
    /** Disable cross-provider fallback for cache-affinity routing. */
    stickyProvider?: boolean;
    /** Force pay-as-you-go billing. */
    billingMode?: BillingMode;
    /** Provider service tier. */
    serviceTier?: ServiceTier;
}
/** Advanced request controls accepted by the plugin. */
export interface AdvancedConfig {
    /** Web-search suffix; `off` sends none. */
    webSearch?: WebSearchMode;
    /** Explicit Claude-style prompt-cache helper. */
    promptCaching?: {
        enabled?: boolean;
        ttl?: '5m' | '1h';
    };
    /** Output-token cap applied when the caller supplies none. */
    maxTokens?: number;
    /** Sampling temperature applied when the caller supplies none. */
    temperature?: number;
    /** Nucleus sampling applied when the caller supplies none. */
    topP?: number;
    /** Optional seeded sampling. */
    seed?: number;
    /** Optional presence penalty. */
    presencePenalty?: number;
    /** Optional frequency penalty. */
    frequencyPenalty?: number;
    /**
     * Deployment-only extra top-level request fields. Reserved routing,
     * authorization, reasoning, model, and transport keys are refused.
     */
    extraBody?: Record<string, unknown>;
}
/** One model override or hand-declared model. */
export interface ModelOverride {
    /** Exact upstream model id. */
    id: string;
    /** Display name override. */
    name?: string;
    /** `false` retires a catalog model from the picker. */
    enabled?: boolean;
    /** Combined context capacity override. */
    contextWindow?: number;
    /** Output-token cap override. */
    maxTokens?: number;
    /** Input modalities override; `[]` is refused. */
    inputModalities?: readonly ('text' | 'image')[];
    /** Exact supported efforts, or `false` for a non-reasoning model. */
    reasoningEfforts?: readonly WireEffort[] | false;
    /** Default effort, or `auto` for the provider default. */
    defaultEffort?: WireEffort | 'auto';
    /** Protocol override for this model. */
    protocol?: Protocol;
    /** Per-model routing override. */
    routing?: RoutingConfig;
    /** Per-model advanced override. */
    advanced?: AdvancedConfig;
    /** Provenance label for the capability facts in this entry. */
    source?: CapabilitySource;
    /** Free-form maintainer note shown in the settings UI. */
    notes?: string;
}
/** Plain configuration snapshot consumed by resolution. */
export interface Options {
    apiKeyEnv?: string;
    baseURL?: string;
    displayName?: string;
    defaultModel?: string;
    defaultReasoningEffort?: string;
    reasoningVisibility?: ReasoningVisibility;
    protocol?: Protocol;
    defaultMaxTokens?: number;
    temperature?: number;
    topP?: number;
    experimentalEfforts?: boolean;
    autoRefresh?: boolean;
    refreshMinutes?: number;
    requestTimeoutMs?: number;
    streamIdleTimeoutMs?: number;
    allowPrivateEndpoints?: boolean;
    allowInsecureEndpoints?: boolean;
    models?: readonly ModelOverride[];
    routing?: RoutingConfig;
    advanced?: AdvancedConfig;
    retryPolicy?: RetryPolicyConfig;
}
/** Live configuration handed to `apply`; volatile fields are stable references. */
export interface Config {
    apiKeyEnv: Volatile<string>;
    baseURL: Volatile<string>;
    displayName: Volatile<string>;
    defaultModel: Volatile<string | undefined>;
    defaultReasoningEffort: Volatile<string | undefined>;
    reasoningVisibility: Volatile<ReasoningVisibility>;
    protocol: Volatile<Protocol>;
    defaultMaxTokens: Volatile<number | undefined>;
    temperature: Volatile<number | undefined>;
    topP: Volatile<number | undefined>;
    experimentalEfforts: Volatile<boolean>;
    autoRefresh: Volatile<boolean>;
    refreshMinutes: Volatile<number>;
    requestTimeoutMs: Volatile<number>;
    streamIdleTimeoutMs: Volatile<number>;
    allowPrivateEndpoints: Volatile<boolean>;
    allowInsecureEndpoints: Volatile<boolean>;
    models: Volatile<readonly ModelOverride[] | undefined>;
    routing: Volatile<RoutingConfig | undefined>;
    advanced: Volatile<AdvancedConfig | undefined>;
    retryPolicy?: RetryPolicyConfig;
}
/** Runtime schema for {@link Config}; volatile fields are user-editable. */
export declare const Config: z<Config>;
/** One resolved model override, with every field validated and detached. */
export interface ResolvedModelOverride {
    id: string;
    name?: string;
    enabled?: boolean;
    contextWindow?: number;
    maxTokens?: number;
    inputModalities?: readonly ('text' | 'image')[];
    reasoningEfforts?: readonly WireEffort[];
    reasoningDisabled?: boolean;
    defaultEffort?: WireEffort | 'auto';
    protocol?: Protocol;
    routing?: Partial<RoutingConfig>;
    advanced?: AdvancedConfig;
    source?: CapabilitySource;
    notes?: string;
}
/** Validated connection facts for one operation. */
export interface ResolvedConfig {
    provider: typeof PROVIDER;
    displayName: string;
    /** Normalized base ending in `/api/v1`, `/v1`, or a custom gateway path. */
    baseURL: string;
    /** Origin used by NanoGPT's non-`/v1` endpoints (balance, providers, subscription usage). */
    origin: string;
    apiKeyEnv?: CredentialRef;
    defaultModel?: string;
    defaultReasoningEffort: WireEffort | 'auto';
    reasoningVisibility: ReasoningVisibility;
    protocol: Protocol;
    defaultMaxTokens?: number;
    temperature?: number;
    topP?: number;
    experimentalEfforts: boolean;
    autoRefresh: boolean;
    refreshMinutes: number;
    requestTimeoutMs: number;
    streamIdleTimeoutMs: number;
    allowPrivateEndpoints: boolean;
    allowInsecureEndpoints: boolean;
    models: readonly ResolvedModelOverride[];
    routing: RoutingConfig;
    advanced: AdvancedConfig;
    retryPolicy: ResolvedRetryPolicy;
}
/** Reserved request keys a deployment `extraBody` may never override. */
export declare const RESERVED_EXTRA_BODY_KEYS: Set<string>;
/** Snapshot the live configuration without resolving it. */
export declare function plainOptions(config: Config): Options;
/** Loopback/private host classification used only for endpoint policy. */
export declare function isPrivateHost(hostname: string): boolean;
/**
 * Normalize and validate the configured base URL.
 *
 * Documented default is `https://api.nano-gpt.com/api/v1`. A bare host gains
 * the documented prefix; an `/api` spelling gains `/v1`; any other custom path
 * is preserved because only the deployment knows its gateway layout.
 * @param raw - configured endpoint.
 * @param policy - endpoint safety policy.
 * @returns normalized base and origin.
 */
export declare function normalizeBaseURL(raw: string, policy: {
    allowPrivate: boolean;
    allowInsecure: boolean;
}): {
    baseURL: string;
    origin: string;
};
/** Validate one routing object and return a detached copy. */
export declare function resolveRouting(raw: RoutingConfig | undefined): RoutingConfig;
/** Validate advanced controls and return a detached copy. */
export declare function resolveAdvanced(raw: AdvancedConfig | undefined): AdvancedConfig;
/** Validate one model override. */
export declare function resolveModelOverride(raw: ModelOverride): ResolvedModelOverride;
/**
 * Resolve raw plugin configuration into validated connection facts.
 * @param options - plain configuration snapshot.
 * @returns validated facts for one operation.
 * @throws when any field is unusable; the message names the field and never a secret.
 */
export declare function resolveConfig(options: Options): ResolvedConfig;
/** Build one protocol endpoint from the resolved base. */
export declare function protocolEndpoint(baseURL: string, protocol: Protocol): string;
/** Documented model listing URL. */
export declare function modelsEndpoint(baseURL: string): string;
/** Provider-discovery URL outside `/api/v1`. */
/**
 * Whether an exact model id is safe to place in a URL path. Slashes and
 * suffixes are valid in NanoGPT ids; empty/dot segments, control characters,
 * and backslashes are not.
 */
export declare function safeUpstreamModelId(modelId: string): boolean;
/** Provider-discovery endpoint for one exact model. */
export declare function providersEndpoint(origin: string, modelId: string): string;
/** Authenticated balance endpoint outside `/api/v1`. */
export declare function balanceEndpoint(origin: string): string;
/** Authenticated aggregate usage endpoint under `/api/v1`. */
export declare function usageEndpoint(baseURL: string): string;
/** Subscription usage endpoint documented under `/api/subscription/v1`. */
export declare function subscriptionUsageEndpoint(origin: string): string;
