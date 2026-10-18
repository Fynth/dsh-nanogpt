import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { RetryPolicySchema, resolveRetryPolicy, } from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
import { DEFAULT_API_KEY_ENV, DEFAULT_BASE_URL, DISPLAY_NAME, PLUGIN_NAME, PROVIDER, PROTOCOLS, VISIBILITIES, WIRE_EFFORTS, } from './shared.js';
/** Routing goal for provider-selection-capable models. */
export const ROUTING_MODES = ['auto', 'speed', 'throughput', 'latency', 'price', 'provider'];
/** Service tiers documented across the three NanoGPT transports. */
export const SERVICE_TIERS = ['auto', 'default', 'standard', 'flex', 'fast', 'priority', 'ultrafast', 'batch'];
/** Billing modes the API documents. */
export const BILLING_MODES = ['default', 'paygo'];
/** Documented web-search suffix choices exposed in the UI. */
export const WEB_SEARCH_MODES = [
    'off',
    'online',
    'online/native',
    'online/linkup',
    'online/linkup-deep',
    'online/tavily',
    'online/tavily-deep',
    'online/brave',
    'online/brave-deep',
    'online/sofya',
    'online/exa-fast',
    'online/exa-auto',
    'online/exa-neural',
    'online/exa-deep',
    'online/exa-deep-reasoning',
    'online/exa-instant',
    'online/kagi',
    'online/kagi-web',
    'online/kagi-news',
    'online/kagi-search',
    'online/perplexity',
    'online/perplexity-deep',
    'online/valyu',
    'online/valyu-deep',
    'online/valyu-web',
    'online/valyu-web-deep',
    'online/firecrawl',
    'online/firecrawl-deep',
];
const effortSchema = z.union(WIRE_EFFORTS.map((value) => z.const(value)));
const protocolSchema = z.union(PROTOCOLS.map((value) => z.const(value)));
const visibilitySchema = z.union(VISIBILITIES.map((value) => z.const(value)));
const routingModeSchema = z.union(ROUTING_MODES.map((value) => z.const(value)));
const serviceTierSchema = z.union(SERVICE_TIERS.map((value) => z.const(value)));
const billingModeSchema = z.union(BILLING_MODES.map((value) => z.const(value)));
const webSearchSchema = z.union(WEB_SEARCH_MODES.map((value) => z.const(value)));
const modalitySchema = z.union([z.const('text'), z.const('image')]);
const promptCachingSchema = z.object({
    enabled: z.boolean(),
    ttl: z.union([z.const('5m'), z.const('1h')]),
});
const routingSchema = z.object({
    mode: routingModeSchema.default('auto'),
    provider: z.string(),
    // Default-on so a parsed-but-omitted field is distinguishable from an
    // explicit `false` (which must emit allow_fallbacks: false).
    allowFallbacks: z.boolean().default(true),
    caching: z.boolean(),
    stickyProvider: z.boolean(),
    billingMode: billingModeSchema,
    serviceTier: serviceTierSchema,
});
const advancedSchema = z.object({
    webSearch: webSearchSchema,
    promptCaching: promptCachingSchema,
    maxTokens: z.number().step(1).min(1),
    temperature: z.number().min(0).max(2),
    topP: z.number().min(0).max(1),
    seed: z.number().step(1),
    presencePenalty: z.number().min(-2).max(2),
    frequencyPenalty: z.number().min(-2).max(2),
    extraBody: z.dict(z.any()),
});
const modelOverrideSchema = z.object({
    id: z.string(),
    name: z.string(),
    enabled: z.boolean(),
    contextWindow: z.number().step(1).min(1),
    maxTokens: z.number().step(1).min(1),
    inputModalities: z.array(modalitySchema),
    reasoningEfforts: z.union([z.array(effortSchema), z.const(false)]),
    defaultEffort: z.union([effortSchema, z.const('auto')]),
    protocol: protocolSchema,
    routing: routingSchema,
    advanced: advancedSchema,
    source: z.union(['api', 'api-route', 'documentation', 'verified', 'user-config', 'inferred', 'unknown'].map((value) => z.const(value))),
    notes: z.string(),
});
/** Runtime schema for {@link Config}; volatile fields are user-editable. */
export const Config = z.object({
    apiKeyEnv: z.string().role('credential-ref').default(DEFAULT_API_KEY_ENV).volatile(),
    baseURL: z.string().default(DEFAULT_BASE_URL).volatile(),
    displayName: z.string().default(DISPLAY_NAME).volatile(),
    defaultModel: z.string().volatile(),
    defaultReasoningEffort: z.string().volatile(),
    reasoningVisibility: visibilitySchema.default('show').volatile(),
    protocol: protocolSchema.default('chat').volatile(),
    defaultMaxTokens: z.number().step(1).min(1).volatile(),
    temperature: z.number().min(0).max(2).volatile(),
    topP: z.number().min(0).max(1).volatile(),
    experimentalEfforts: z.boolean().default(false).volatile(),
    autoRefresh: z.boolean().default(true).volatile(),
    refreshMinutes: z.number().step(1).min(0).default(360).volatile(),
    requestTimeoutMs: z.number().step(1).min(1).default(60_000).volatile(),
    streamIdleTimeoutMs: z.number().step(1).min(1).default(300_000).volatile(),
    allowPrivateEndpoints: z.boolean().default(false).volatile(),
    allowInsecureEndpoints: z.boolean().default(false).volatile(),
    models: z.array(modelOverrideSchema).volatile(),
    routing: routingSchema.volatile(),
    advanced: advancedSchema.volatile(),
    retryPolicy: RetryPolicySchema,
});
/** Reserved request keys a deployment `extraBody` may never override. */
export const RESERVED_EXTRA_BODY_KEYS = new Set([
    'model',
    'messages',
    'input',
    'instructions',
    'system',
    'tools',
    'tool_choice',
    'stream',
    'stream_options',
    'reasoning',
    'reasoning_effort',
    'reasoningEffort',
    'thinking',
    'output_config',
    'service_tier',
    'billing_mode',
    'billingMode',
    'caching',
    'promptCaching',
    'prompt_caching',
    'cache_control',
    'top_k',
    'stickyProvider',
    'stickyprovider',
    'provider',
    'max_tokens',
    'max_completion_tokens',
    'max_output_tokens',
    'temperature',
    'top_p',
    'stop',
    'stop_sequences',
    'seed',
    'presence_penalty',
    'frequency_penalty',
    'stream_options',
    'store',
    'include',
    'prompt_cache_key',
    'metadata',
    'previous_response_id',
    'conversation',
    'text',
    'parallel_tool_calls',
    'max_tool_calls',
    'background',
    'retention_days',
    'safety_identifier',
    'authorization',
    'Authorization',
    'x-api-key',
    'api_key',
    'apikey',
]);
/** Snapshot the live configuration without resolving it. */
export function plainOptions(config) {
    return {
        apiKeyEnv: config.apiKeyEnv.get(),
        baseURL: config.baseURL.get(),
        displayName: config.displayName.get(),
        defaultModel: config.defaultModel.get(),
        defaultReasoningEffort: config.defaultReasoningEffort.get(),
        reasoningVisibility: config.reasoningVisibility.get(),
        protocol: config.protocol.get(),
        defaultMaxTokens: config.defaultMaxTokens.get(),
        temperature: config.temperature.get(),
        topP: config.topP.get(),
        experimentalEfforts: config.experimentalEfforts.get(),
        autoRefresh: config.autoRefresh.get(),
        refreshMinutes: config.refreshMinutes.get(),
        requestTimeoutMs: config.requestTimeoutMs.get(),
        streamIdleTimeoutMs: config.streamIdleTimeoutMs.get(),
        allowPrivateEndpoints: config.allowPrivateEndpoints.get(),
        allowInsecureEndpoints: config.allowInsecureEndpoints.get(),
        models: config.models.get(),
        routing: config.routing.get(),
        advanced: config.advanced.get(),
        ...config.retryPolicy === undefined ? {} : { retryPolicy: config.retryPolicy },
    };
}
/** Refuse a value that is not a usable positive integer. */
function positiveInteger(value, field) {
    if (value === undefined)
        return undefined;
    if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
        throw new Error(`${PLUGIN_NAME}: ${field} must be a positive integer, got ${String(value)}`);
    }
    return value;
}
/** Refuse a non-empty string that is only whitespace. */
function trimmed(value, field) {
    if (value === undefined)
        return undefined;
    const result = value.trim();
    if (result.length === 0)
        return undefined;
    if (result.length > 512)
        throw new Error(`${PLUGIN_NAME}: ${field} is too long`);
    return result;
}
/** Loopback/private host classification used only for endpoint policy. */
export function isPrivateHost(hostname) {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local'))
        return true;
    if (host === 'host.docker.internal' || host.endsWith('.internal'))
        return true;
    if (host === '::' || host === '::1' || host === '0:0:0:0:0:0:0:1' || host === '0.0.0.0')
        return true;
    // IPv4-mapped/compatible IPv6 addresses (WHATWG may serialize these in hex).
    const mapped = /^(?:0{0,4}:){0,5}:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(host);
    if (mapped !== null) {
        const high = Number.parseInt(mapped[1], 16);
        const low = Number.parseInt(mapped[2], 16);
        return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    if (host.startsWith('fc') || host.startsWith('fd'))
        return host.includes(':');
    if (/^fe[89ab]/.test(host))
        return host.includes(':');
    return isPrivateIpv4(host);
}
/** Whether a dotted IPv4 literal is loopback, private, link-local, or unspecified. */
function isPrivateIpv4(host) {
    const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
    if (ipv4 === null)
        return false;
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((octet) => octet > 255))
        return true;
    const [a = 0, b = 0] = octets;
    return (a === 10 ||
        a === 127 ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 100 && b >= 64 && b <= 127) ||
        a === 0);
}
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
export function normalizeBaseURL(raw, policy) {
    const value = raw.trim();
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error(`${PLUGIN_NAME}: baseURL "${value}" is not a valid URL`);
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        throw new Error(`${PLUGIN_NAME}: baseURL must use http or https`);
    }
    if (url.username !== '' || url.password !== '') {
        throw new Error(`${PLUGIN_NAME}: baseURL must not contain credentials`);
    }
    if (url.search !== '' || url.hash !== '') {
        throw new Error(`${PLUGIN_NAME}: baseURL must not contain a query or fragment`);
    }
    const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1' || url.hostname === '[::1]';
    if (url.protocol === 'http:' && !loopback && !policy.allowInsecure) {
        throw new Error(`${PLUGIN_NAME}: refusing plaintext baseURL "${value}"; use https or set allowInsecureEndpoints for a trusted private endpoint`);
    }
    if (isPrivateHost(url.hostname) && !policy.allowPrivate) {
        throw new Error(`${PLUGIN_NAME}: refusing private endpoint "${value}"; set allowPrivateEndpoints: true to use a self-hosted gateway`);
    }
    let path = url.pathname.replace(/\/+$/, '');
    if (path === '' || path === '/')
        path = '/api/v1';
    else if (path === '/api')
        path = '/api/v1';
    else if (path === '/v1')
        path = '/v1';
    url.pathname = path;
    return { baseURL: `${url.origin}${path}`, origin: url.origin };
}
/** Validate one routing object and return a detached copy. */
export function resolveRouting(raw) {
    if (raw === undefined)
        return { mode: 'auto' };
    if (!ROUTING_MODES.includes(raw.mode)) {
        throw new Error(`${PLUGIN_NAME}: routing.mode "${String(raw.mode)}" is not supported`);
    }
    const provider = trimmed(raw.provider, 'routing.provider');
    if (provider !== undefined && !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(provider)) {
        throw new Error(`${PLUGIN_NAME}: routing.provider "${provider}" is not a public provider id`);
    }
    if (raw.mode === 'provider' && provider === undefined) {
        throw new Error(`${PLUGIN_NAME}: routing.mode "provider" requires a provider id`);
    }
    if (raw.mode !== 'provider' && provider !== undefined) {
        throw new Error(`${PLUGIN_NAME}: routing.provider is only valid with routing.mode "provider"`);
    }
    if (raw.serviceTier !== undefined && !SERVICE_TIERS.includes(raw.serviceTier)) {
        throw new Error(`${PLUGIN_NAME}: routing.serviceTier "${String(raw.serviceTier)}" is not supported`);
    }
    if (raw.billingMode !== undefined && !BILLING_MODES.includes(raw.billingMode)) {
        throw new Error(`${PLUGIN_NAME}: routing.billingMode "${String(raw.billingMode)}" is not supported`);
    }
    return {
        mode: raw.mode,
        ...provider === undefined ? {} : { provider },
        ...raw.allowFallbacks === false ? { allowFallbacks: false } : {},
        ...raw.caching === true ? { caching: true } : {},
        ...raw.stickyProvider === true ? { stickyProvider: true } : {},
        ...raw.billingMode === undefined ? {} : { billingMode: raw.billingMode },
        ...raw.serviceTier === undefined ? {} : { serviceTier: raw.serviceTier },
    };
}
/** Validate advanced controls and return a detached copy. */
export function resolveAdvanced(raw) {
    if (raw === undefined)
        return {};
    const webSearch = raw.webSearch;
    if (webSearch !== undefined && !WEB_SEARCH_MODES.includes(webSearch)) {
        throw new Error(`${PLUGIN_NAME}: advanced.webSearch "${String(webSearch)}" is not a supported suffix`);
    }
    const maxTokens = positiveInteger(raw.maxTokens, 'advanced.maxTokens');
    if (raw.temperature !== undefined && (!Number.isFinite(raw.temperature) || raw.temperature < 0 || raw.temperature > 2)) {
        throw new Error(`${PLUGIN_NAME}: advanced.temperature must be between 0 and 2`);
    }
    if (raw.topP !== undefined && (!Number.isFinite(raw.topP) || raw.topP < 0 || raw.topP > 1)) {
        throw new Error(`${PLUGIN_NAME}: advanced.topP must be between 0 and 1`);
    }
    const extraBody = raw.extraBody;
    if (extraBody !== undefined) {
        if (extraBody === null || typeof extraBody !== 'object' || Array.isArray(extraBody)) {
            throw new Error(`${PLUGIN_NAME}: advanced.extraBody must be a JSON object`);
        }
        for (const key of Object.keys(extraBody)) {
            if (RESERVED_EXTRA_BODY_KEYS.has(key)) {
                throw new Error(`${PLUGIN_NAME}: advanced.extraBody must not override reserved field "${key}"`);
            }
            if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
                throw new Error(`${PLUGIN_NAME}: advanced.extraBody must not use the reserved object key "${key}"`);
            }
            if (key.startsWith('x-dsh-') || key.toLowerCase().startsWith('authorization')) {
                throw new Error(`${PLUGIN_NAME}: advanced.extraBody must not override runtime field "${key}"`);
            }
        }
    }
    const promptCaching = raw.promptCaching;
    const promptCachingFields = {
        ...promptCaching?.enabled === undefined ? {} : { enabled: promptCaching.enabled },
        ...promptCaching?.ttl === undefined ? {} : { ttl: promptCaching.ttl },
    };
    return {
        ...webSearch === undefined ? {} : { webSearch },
        ...Object.keys(promptCachingFields).length === 0 ? {} : { promptCaching: promptCachingFields },
        ...maxTokens === undefined ? {} : { maxTokens },
        ...raw.temperature === undefined ? {} : { temperature: raw.temperature },
        ...raw.topP === undefined ? {} : { topP: raw.topP },
        ...raw.seed === undefined ? {} : { seed: raw.seed },
        ...raw.presencePenalty === undefined ? {} : { presencePenalty: raw.presencePenalty },
        ...raw.frequencyPenalty === undefined ? {} : { frequencyPenalty: raw.frequencyPenalty },
        ...extraBody === undefined || Object.keys(extraBody).length === 0 ? {} : { extraBody: { ...extraBody } },
    };
}
/** Whether a parsed routing object carries nothing but schema defaults. */
function defaultOnlyRouting(raw) {
    return (raw !== undefined &&
        raw.mode === 'auto' &&
        raw.provider === undefined &&
        raw.allowFallbacks !== false &&
        raw.caching !== true &&
        raw.stickyProvider !== true &&
        raw.billingMode === undefined &&
        raw.serviceTier === undefined);
}
/** Drop schema-default fields so a partial override merges over global routing. */
function compactRoutingOverride(raw) {
    const out = {};
    if (raw.mode !== 'auto')
        out.mode = raw.mode;
    if (raw.provider !== undefined)
        out.provider = raw.provider;
    if (raw.allowFallbacks === false)
        out.allowFallbacks = false;
    if (raw.caching === true)
        out.caching = true;
    if (raw.stickyProvider === true)
        out.stickyProvider = true;
    if (raw.billingMode !== undefined)
        out.billingMode = raw.billingMode;
    if (raw.serviceTier !== undefined && raw.serviceTier !== 'auto')
        out.serviceTier = raw.serviceTier;
    return out;
}
/** Whether a parsed advanced object carries nothing but schema defaults. */
function defaultOnlyAdvanced(raw) {
    if (raw === undefined)
        return false;
    const extra = raw.extraBody ?? {};
    const caching = raw.promptCaching ?? {};
    return (raw.webSearch === undefined &&
        raw.maxTokens === undefined &&
        raw.temperature === undefined &&
        raw.topP === undefined &&
        raw.seed === undefined &&
        raw.presencePenalty === undefined &&
        raw.frequencyPenalty === undefined &&
        caching.enabled === undefined &&
        caching.ttl === undefined &&
        Object.keys(extra).length === 0);
}
/** Validate one model override. */
export function resolveModelOverride(raw) {
    const id = raw.id.trim();
    if (id.length === 0)
        throw new Error(`${PLUGIN_NAME}: model override id must not be empty`);
    if (id.length > 200)
        throw new Error(`${PLUGIN_NAME}: model id "${id.slice(0, 40)}…" is too long`);
    // Schemastery materializes empty arrays for undeclared array fields. An
    // omitted array means "inherit", not "declared empty", so normalize it
    // before validation; otherwise every parsed model override would fail.
    const efforts = Array.isArray(raw.reasoningEfforts) && raw.reasoningEfforts.length === 0
        ? undefined
        : raw.reasoningEfforts;
    let reasoningEfforts;
    let reasoningDisabled = false;
    if (efforts === false) {
        reasoningDisabled = true;
    }
    else if (efforts !== undefined) {
        const unique = [...new Set(efforts)];
        const invalid = unique.filter((effort) => !WIRE_EFFORTS.includes(effort));
        if (invalid.length > 0) {
            throw new Error(`${PLUGIN_NAME}: model "${id}" declares unknown reasoning effort "${invalid[0]}"`);
        }
        reasoningEfforts = WIRE_EFFORTS.filter((effort) => unique.includes(effort));
    }
    if (raw.defaultEffort !== undefined && raw.defaultEffort !== 'auto' && !WIRE_EFFORTS.includes(raw.defaultEffort)) {
        throw new Error(`${PLUGIN_NAME}: model "${id}" declares unknown defaultEffort "${String(raw.defaultEffort)}"`);
    }
    if (raw.defaultEffort !== undefined &&
        raw.defaultEffort !== 'auto' &&
        reasoningEfforts !== undefined &&
        !reasoningEfforts.includes(raw.defaultEffort)) {
        throw new Error(`${PLUGIN_NAME}: model "${id}" defaultEffort "${raw.defaultEffort}" is not in its declared efforts`);
    }
    if (reasoningDisabled && raw.defaultEffort !== undefined && raw.defaultEffort !== 'auto') {
        throw new Error(`${PLUGIN_NAME}: model "${id}" disables reasoning but declares defaultEffort "${raw.defaultEffort}"`);
    }
    const modalities = raw.inputModalities === undefined || raw.inputModalities.length === 0
        ? undefined
        : [...new Set(raw.inputModalities)];
    const routing = defaultOnlyRouting(raw.routing) ? undefined : raw.routing;
    const advanced = defaultOnlyAdvanced(raw.advanced) ? undefined : raw.advanced;
    const name = trimmed(raw.name, `model "${id}" name`);
    const notes = trimmed(raw.notes, `model "${id}" notes`);
    return {
        id,
        ...name === undefined ? {} : { name },
        ...raw.enabled === undefined ? {} : { enabled: raw.enabled },
        ...positiveInteger(raw.contextWindow, `model "${id}" contextWindow`) === undefined
            ? {}
            : { contextWindow: positiveInteger(raw.contextWindow, `model "${id}" contextWindow`) },
        ...positiveInteger(raw.maxTokens, `model "${id}" maxTokens`) === undefined
            ? {}
            : { maxTokens: positiveInteger(raw.maxTokens, `model "${id}" maxTokens`) },
        ...modalities === undefined ? {} : { inputModalities: modalities },
        ...reasoningEfforts === undefined ? {} : { reasoningEfforts },
        ...reasoningDisabled ? { reasoningDisabled: true } : {},
        ...raw.defaultEffort === undefined ? {} : { defaultEffort: raw.defaultEffort },
        ...raw.protocol === undefined ? {} : { protocol: raw.protocol },
        ...routing === undefined ? {} : { routing: compactRoutingOverride(resolveRouting(routing)) },
        ...advanced === undefined ? {} : { advanced: resolveAdvanced(advanced) },
        ...raw.source === undefined ? { source: 'user-config' } : { source: raw.source },
        ...notes === undefined ? {} : { notes },
    };
}
/**
 * Resolve raw plugin configuration into validated connection facts.
 * @param options - plain configuration snapshot.
 * @returns validated facts for one operation.
 * @throws when any field is unusable; the message names the field and never a secret.
 */
export function resolveConfig(options) {
    const allowPrivateEndpoints = options.allowPrivateEndpoints === true;
    const allowInsecureEndpoints = options.allowInsecureEndpoints === true;
    const { baseURL, origin } = normalizeBaseURL(options.baseURL ?? DEFAULT_BASE_URL, {
        allowPrivate: allowPrivateEndpoints,
        allowInsecure: allowInsecureEndpoints,
    });
    const rawRef = (options.apiKeyEnv ?? DEFAULT_API_KEY_ENV).trim();
    let apiKeyEnv;
    if (rawRef.length > 0) {
        try {
            apiKeyEnv = credentialRef(rawRef);
        }
        catch {
            throw new Error(`${PLUGIN_NAME}: apiKeyEnv "${rawRef}" is not a valid credential reference`);
        }
    }
    const defaultReasoningEffortRaw = trimmed(options.defaultReasoningEffort, 'defaultReasoningEffort') ?? 'auto';
    if (defaultReasoningEffortRaw !== 'auto' && !WIRE_EFFORTS.includes(defaultReasoningEffortRaw)) {
        throw new Error(`${PLUGIN_NAME}: defaultReasoningEffort "${defaultReasoningEffortRaw}" is not a NanoGPT effort`);
    }
    const modelIds = new Set();
    const models = (options.models ?? []).map((model) => {
        const resolved = resolveModelOverride(model);
        if (modelIds.has(resolved.id)) {
            throw new Error(`${PLUGIN_NAME}: duplicate model override id "${resolved.id}"`);
        }
        modelIds.add(resolved.id);
        return resolved;
    });
    const routing = resolveRouting(options.routing);
    const advanced = resolveAdvanced(options.advanced);
    if (advanced.promptCaching?.ttl !== undefined && advanced.promptCaching.enabled !== true) {
        throw new Error(`${PLUGIN_NAME}: advanced.promptCaching.ttl requires promptCaching.enabled: true`);
    }
    if (options.defaultMaxTokens !== undefined)
        positiveInteger(options.defaultMaxTokens, 'defaultMaxTokens');
    if (options.temperature !== undefined && (!Number.isFinite(options.temperature) || options.temperature < 0 || options.temperature > 2)) {
        throw new Error(`${PLUGIN_NAME}: temperature must be between 0 and 2`);
    }
    if (options.topP !== undefined && (!Number.isFinite(options.topP) || options.topP < 0 || options.topP > 1)) {
        throw new Error(`${PLUGIN_NAME}: topP must be between 0 and 1`);
    }
    const defaultModel = trimmed(options.defaultModel, 'defaultModel');
    return {
        provider: PROVIDER,
        displayName: trimmed(options.displayName, 'displayName') ?? DISPLAY_NAME,
        baseURL,
        origin,
        ...apiKeyEnv === undefined ? {} : { apiKeyEnv },
        ...defaultModel === undefined ? {} : { defaultModel },
        defaultReasoningEffort: defaultReasoningEffortRaw,
        reasoningVisibility: options.reasoningVisibility ?? 'show',
        protocol: options.protocol ?? 'chat',
        ...positiveInteger(options.defaultMaxTokens, 'defaultMaxTokens') === undefined
            ? {}
            : { defaultMaxTokens: positiveInteger(options.defaultMaxTokens, 'defaultMaxTokens') },
        ...options.temperature === undefined ? {} : { temperature: options.temperature },
        ...options.topP === undefined ? {} : { topP: options.topP },
        experimentalEfforts: options.experimentalEfforts === true,
        autoRefresh: options.autoRefresh !== false,
        refreshMinutes: Math.max(0, Math.floor(options.refreshMinutes ?? 360)),
        requestTimeoutMs: positiveInteger(options.requestTimeoutMs, 'requestTimeoutMs') ?? 60_000,
        streamIdleTimeoutMs: positiveInteger(options.streamIdleTimeoutMs, 'streamIdleTimeoutMs') ?? 300_000,
        allowPrivateEndpoints,
        allowInsecureEndpoints,
        models,
        routing,
        advanced,
        retryPolicy: resolveRetryPolicy(options.retryPolicy, `${PLUGIN_NAME} retryPolicy`),
    };
}
/** Build one protocol endpoint from the resolved base. */
export function protocolEndpoint(baseURL, protocol) {
    switch (protocol) {
        case 'chat':
            return `${baseURL}/chat/completions`;
        case 'responses':
            return `${baseURL}/responses`;
        case 'messages':
            return `${baseURL}/messages`;
    }
}
/** Documented model listing URL. */
export function modelsEndpoint(baseURL) {
    return `${baseURL}/models?detailed=true`;
}
/** Provider-discovery URL outside `/api/v1`. */
/**
 * Whether an exact model id is safe to place in a URL path. Slashes and
 * suffixes are valid in NanoGPT ids; empty/dot segments, control characters,
 * and backslashes are not.
 */
export function safeUpstreamModelId(modelId) {
    if (modelId.length === 0 || modelId.length > 200)
        return false;
    if (/[\u0000-\u001f\\?#]/.test(modelId))
        return false;
    const segments = modelId.split('/');
    return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}
/** Provider-discovery endpoint for one exact model. */
export function providersEndpoint(origin, modelId) {
    if (!safeUpstreamModelId(modelId)) {
        throw new Error(`${PLUGIN_NAME}: model id is not safe for a provider-discovery URL`);
    }
    return `${origin}/api/models/${encodeURIComponent(modelId)}/providers`;
}
/** Authenticated balance endpoint outside `/api/v1`. */
export function balanceEndpoint(origin) {
    return `${origin}/api/check-balance`;
}
/** Authenticated aggregate usage endpoint under `/api/v1`. */
export function usageEndpoint(baseURL) {
    return `${baseURL}/usage`;
}
/** Subscription usage endpoint documented under `/api/subscription/v1`. */
export function subscriptionUsageEndpoint(origin) {
    return `${origin}/api/subscription/v1/usage`;
}
