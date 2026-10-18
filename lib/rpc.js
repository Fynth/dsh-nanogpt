/**
 * The authenticated, browser-facing RPC channel for Settings → NanoGPT.
 *
 * The browser never receives an API key, a raw request body from a real
 * session, or a deployment secret. Every credentialed read happens here, every
 * write targets the reference the host configuration names, and the request
 * preview uses the same serializer as real traffic with a synthetic prompt.
 *
 * @module dsh-nanogpt/rpc
 */
import { credentialRef } from '@deepseek-ai/dsh-credentials';
import { assertUsableApiKey, LlmError } from '@deepseek-ai/dsh-llm';
import { probeCatalog, testConnection } from './discovery.js';
import { isRecord, optionalString } from './catalog.js';
import { buildModelViews, effortView } from './model-view.js';
import { PreferencesError, } from './preferences.js';
import { readBalance, readSubscription, readUsage } from './usage.js';
/** Channel the browser half registers and calls under. */
export const RPC_CHANNEL = '/nanogpt';
/** Endpoint names. */
export const RPC_ENDPOINTS = {
    status: 'status',
    catalogStatus: 'catalog/status',
    catalogRefresh: 'catalog/refresh',
    credentialStatus: 'credential/status',
    credentialSet: 'credential/set',
    credentialRemove: 'credential/remove',
    connectionTest: 'connection/test',
    modelsQuery: 'models/query',
    modelsGet: 'models/get',
    modelsProviders: 'models/providers',
    preferencesGet: 'preferences/get',
    preferencesUpdate: 'preferences/update',
    preferencesExport: 'preferences/export',
    preferencesImport: 'preferences/import',
    defaultSet: 'default/set',
    usageRead: 'usage/read',
    diagnosticsList: 'diagnostics/list',
    diagnosticsClear: 'diagnostics/clear',
    requestPreview: 'request/preview',
};
/** Build a success reply. */
function ok(value) {
    return { ok: true, value };
}
/** Build a failure reply. */
function fail(code, message, details = {}) {
    return { ok: false, error: { code, message, details } };
}
/** Convert one thrown value into a safe RPC failure. */
function failureOf(error) {
    if (error instanceof PreferencesError)
        return fail(error.code, error.message);
    if (error instanceof LlmError) {
        return fail(error.code, error.message, {
            ...error.failure.status === undefined ? {} : { status: error.failure.status },
            ...error.failure.requestId === undefined ? {} : { requestId: error.failure.requestId },
        });
    }
    const code = isRecord(error) && typeof error.code === 'string' ? error.code : 'INTERNAL';
    return fail(code, error instanceof Error ? error.message : 'NanoGPT operation failed');
}
/** Read one bounded payload string. */
function payloadString(payload, key, max = 512) {
    const value = payload[key];
    if (typeof value !== 'string')
        return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return undefined;
    return trimmed.slice(0, max);
}
/** Read one optional payload boolean. */
function payloadBoolean(payload, key) {
    return typeof payload[key] === 'boolean' ? payload[key] : undefined;
}
/** Read one optional bounded integer. */
function payloadInteger(payload, key, min, max) {
    const value = payload[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value))
        return undefined;
    return Math.min(max, Math.max(min, value));
}
/** Read the request payload as a record, refusing arrays and primitives. */
function payloadRecord(payload) {
    return isRecord(payload) ? payload : undefined;
}
/** Current credential status without the value. */
async function credentialStatus(options) {
    const config = options.config();
    const reference = config.apiKeyEnv === undefined ? undefined : String(config.apiKeyEnv);
    let configured = false;
    let writable = false;
    let source;
    const credentials = options.credentials();
    if (reference !== undefined && credentials !== undefined) {
        try {
            const info = await credentials.describe(credentialRef(reference));
            configured = info.configured === true;
            writable = info.writable === true;
            source = info.source;
        }
        catch {
            // A store that cannot answer leaves both facts false.
        }
    }
    if (!configured && reference !== undefined) {
        configured = (await options.resolveCredential(credentialRef(reference))) !== undefined;
    }
    return {
        ...reference === undefined ? {} : { reference },
        configured,
        writable,
        ...source === undefined ? {} : { source },
    };
}
/** Read the live DSH default-model selection without exposing unrelated config. */
export function agentDefaultView(options) {
    const service = options.agentDefaultModel?.();
    if (service === undefined)
        return { available: false, writable: false };
    try {
        const current = service.currentSelection();
        return {
            available: true,
            writable: typeof service.saveSelection === 'function',
            provider: current.provider,
            model: current.model,
            ...current.reasoningEffort === undefined ? {} : { reasoningEffort: current.reasoningEffort },
        };
    }
    catch (error) {
        return {
            available: true,
            writable: false,
            error: error instanceof Error ? error.message : 'the default-model service could not be read',
        };
    }
}
/** Count model visibility states. */
function countsOf(views) {
    return {
        total: views.length,
        visible: views.filter((view) => !view.hidden && !view.disabled).length,
        hidden: views.filter((view) => view.hidden).length,
        disabled: views.filter((view) => view.disabled).length,
        favorites: views.filter((view) => view.favorite).length,
        pinned: views.filter((view) => view.pinned).length,
    };
}
/** Model browser summary item. */
function modelSummary(view) {
    const { model, reasoning } = view;
    return {
        id: model.id,
        name: model.name,
        ...model.provider === undefined ? {} : { provider: model.provider },
        ...model.description === undefined ? {} : { description: model.description },
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxOutputTokens === undefined ? {} : { maxOutputTokens: model.maxOutputTokens },
        ...model.inputModalities === undefined ? {} : { inputModalities: model.inputModalities },
        capabilities: {
            ...model.vision === undefined ? {} : { vision: model.vision },
            ...model.reasoning === undefined ? {} : { reasoning: model.reasoning },
            ...model.toolCalling === undefined ? {} : { toolCalling: model.toolCalling },
            ...model.parallelToolCalls === undefined ? {} : { parallelToolCalls: model.parallelToolCalls },
            ...model.structuredOutput === undefined ? {} : { structuredOutput: model.structuredOutput },
            ...model.videoInput === undefined ? {} : { videoInput: model.videoInput },
            ...model.audioInput === undefined ? {} : { audioInput: model.audioInput },
            ...model.pdfUpload === undefined ? {} : { pdfUpload: model.pdfUpload },
        },
        ...model.pricing === undefined ? {} : { pricing: model.pricing },
        ...model.pricingSource === undefined ? {} : { pricingSource: model.pricingSource },
        ...model.currency === undefined ? {} : { currency: model.currency },
        serviceTiers: model.serviceTiers,
        ...model.subscriptionIncluded === undefined ? {} : { subscriptionIncluded: model.subscriptionIncluded },
        ...model.subscriptionInputMultiplier === undefined ? {} : { subscriptionInputMultiplier: model.subscriptionInputMultiplier },
        ...model.subscriptionNote === undefined ? {} : { subscriptionNote: model.subscriptionNote },
        ...model.category === undefined ? {} : { category: model.category },
        ...model.openWeights === undefined ? {} : { openWeights: model.openWeights },
        aliases: model.aliases,
        providers: model.providers,
        source: model.source,
        ...model.verifiedAt === undefined ? {} : { verifiedAt: model.verifiedAt },
        hidden: view.hidden,
        disabled: view.disabled,
        favorite: view.favorite,
        pinned: view.pinned,
        protocol: view.protocol,
        routing: view.routing,
        ...reasoning === undefined
            ? {}
            : {
                reasoning: {
                    efforts: effortView(reasoning),
                    ...reasoning.defaultEffort === undefined ? {} : { defaultEffort: reasoning.defaultEffort },
                    source: reasoning.source,
                    alwaysThinking: reasoning.alwaysThinking,
                    supportsDisable: reasoning.supportsDisable,
                    unknown: reasoning.unknown,
                    experimental: reasoning.experimental,
                    unverifiedLevels: reasoning.unverifiedLevels,
                    notes: reasoning.notes,
                    ...reasoning.verifiedAt === undefined ? {} : { verifiedAt: reasoning.verifiedAt },
                    ...reasoning.route === undefined ? {} : { route: reasoning.route },
                },
            },
    };
}
/** Filter and sort one model browser page. */
function queryModels(views, payload, showHiddenDefault) {
    const query = optionalString(payload.query)?.toLowerCase().slice(0, 200);
    const providerFilter = optionalString(payload.provider)?.toLowerCase();
    const reasoningOnly = payloadBoolean(payload, 'reasoning') === true;
    const toolsOnly = payloadBoolean(payload, 'tools') === true;
    const visionOnly = payloadBoolean(payload, 'vision') === true;
    const favoritesOnly = payloadBoolean(payload, 'favoritesOnly') === true;
    const showHidden = payloadBoolean(payload, 'showHidden') ?? showHiddenDefault;
    const tier = optionalString(payload.tier);
    const sort = optionalString(payload.sort) ?? 'name';
    const offset = payloadInteger(payload, 'offset', 0, 100_000) ?? 0;
    const limit = payloadInteger(payload, 'limit', 1, 200) ?? 50;
    const providers = [...new Set(views.map((view) => view.model.provider).filter((provider) => provider !== undefined))].sort();
    const filtered = views.filter((view) => {
        if (!showHidden && (view.hidden || view.disabled))
            return false;
        if (favoritesOnly && !view.favorite && !view.pinned)
            return false;
        if (providerFilter !== undefined && view.model.provider?.toLowerCase() !== providerFilter)
            return false;
        if (reasoningOnly && view.reasoning === undefined)
            return false;
        if (toolsOnly && view.model.toolCalling !== true)
            return false;
        if (visionOnly && view.model.vision !== true && view.model.inputModalities?.includes('image') !== true)
            return false;
        if (tier !== undefined && !view.model.serviceTiers.includes(tier))
            return false;
        if (query !== undefined) {
            const haystack = `${view.model.id} ${view.model.name} ${view.model.provider ?? ''} ${view.model.description ?? ''}`.toLowerCase();
            if (!haystack.includes(query))
                return false;
        }
        return true;
    });
    filtered.sort((a, b) => {
        if (sort === 'context')
            return (b.model.contextWindow ?? -1) - (a.model.contextWindow ?? -1);
        if (sort === 'input-price')
            return (a.model.pricing?.input ?? Number.POSITIVE_INFINITY) - (b.model.pricing?.input ?? Number.POSITIVE_INFINITY);
        if (sort === 'output-price')
            return (a.model.pricing?.output ?? Number.POSITIVE_INFINITY) - (b.model.pricing?.output ?? Number.POSITIVE_INFINITY);
        if (sort === 'provider')
            return (a.model.provider ?? '').localeCompare(b.model.provider ?? '') || a.model.name.localeCompare(b.model.name);
        return a.model.name.localeCompare(b.model.name, undefined, { sensitivity: 'base' });
    });
    return {
        items: filtered.slice(offset, offset + limit).map(modelSummary),
        total: filtered.length,
        offset,
        limit,
        providers,
    };
}
/** Decode a preferences patch. */
function decodePreferencesPatch(payload) {
    const revision = payloadInteger(payload, 'revision', 1, Number.MAX_SAFE_INTEGER);
    const patch = payload.patch;
    if (!isRecord(patch))
        throw new PreferencesError('preferences patch must be a JSON object', 'INVALID_PREFERENCES');
    if (Object.keys(patch).length > 30)
        throw new PreferencesError('preferences patch has too many fields', 'INVALID_PREFERENCES');
    return {
        ...revision === undefined ? {} : { revision },
        patch: patch,
    };
}
/** Sanitize preview headers so no credential or cookie can be read back. */
function sanitizePreviewHeaders(headers) {
    const result = {};
    for (const [name, value] of Object.entries(headers)) {
        const lower = name.toLowerCase();
        if (lower === 'authorization' || lower === 'cookie' || lower === 'x-api-key' || lower === 'set-cookie') {
            result[name] = lower === 'authorization' ? 'Bearer <redacted by host>' : '<redacted by host>';
            continue;
        }
        result[name] = value;
    }
    return result;
}
/** Read account views for the settings page. */
async function accountViews(options, signal) {
    const config = options.config();
    let apiKey;
    let credentialFailure;
    if (config.apiKeyEnv !== undefined) {
        try {
            apiKey = await options.resolveCredential(config.apiKeyEnv);
        }
        catch {
            apiKey = undefined;
        }
    }
    if (apiKey !== undefined) {
        try {
            apiKey = assertUsableApiKey(apiKey, 'llm-nanogpt', String(config.apiKeyEnv));
        }
        catch (error) {
            apiKey = undefined;
            credentialFailure = {
                code: 'INVALID_CREDENTIAL',
                message: error instanceof Error ? error.message : 'the configured NanoGPT credential is unusable',
            };
        }
    }
    if (apiKey === undefined) {
        const failure = credentialFailure ?? {
            code: 'MISSING_CREDENTIAL',
            message: 'No NanoGPT API key is configured; account usage and balance cannot be read.',
        };
        return {
            balance: { failure },
            usage: { failure },
            subscription: { failure },
        };
    }
    const common = {
        origin: config.origin,
        baseURL: config.baseURL,
        apiKey,
        attribution: options.discovery.attribution,
        timeoutMs: Math.min(config.requestTimeoutMs, 20_000),
        ...options.discovery.fetch === undefined ? {} : { fetch: options.discovery.fetch },
        signal,
    };
    const [balance, usage, subscription] = await Promise.all([
        readBalance(common),
        readUsage(common),
        readSubscription(common),
    ]);
    return { balance, usage, subscription };
}
/**
 * Build the RPC handler.
 * @param options - live readers, adapter, store, credentials, and discovery.
 * @returns the handler to register on `connection.rpc.handle`.
 */
export function createNanoGptRpcHandler(options) {
    return async (endpoint, rawPayload, signal) => {
        try {
            const payload = payloadRecord(rawPayload) ?? {};
            switch (endpoint) {
                case RPC_ENDPOINTS.status: {
                    const config = options.config();
                    const catalog = options.catalog();
                    const preferences = options.preferences();
                    const views = buildModelViews(config, preferences, catalog.current());
                    const credential = await credentialStatus(options);
                    const catalogStatus = catalog.status();
                    return ok({
                        provider: config.provider,
                        displayName: config.displayName,
                        baseURL: config.baseURL,
                        protocol: config.protocol,
                        defaultModel: config.defaultModel,
                        defaultReasoningEffort: config.defaultReasoningEffort,
                        reasoningVisibility: config.reasoningVisibility,
                        experimentalEfforts: config.experimentalEfforts,
                        autoRefresh: config.autoRefresh,
                        refreshMinutes: config.refreshMinutes,
                        requestTimeoutMs: config.requestTimeoutMs,
                        streamIdleTimeoutMs: config.streamIdleTimeoutMs,
                        defaultMaxTokens: config.defaultMaxTokens,
                        credential,
                        catalog: catalogStatus,
                        counts: countsOf(views),
                        agentDefault: agentDefaultView(options),
                        preferences: {
                            revision: preferences.revision,
                            ...preferences.defaultModel === undefined ? {} : { defaultModel: preferences.defaultModel },
                            ...preferences.defaultReasoningEffort === undefined ? {} : { defaultReasoningEffort: preferences.defaultReasoningEffort },
                            ...preferences.reasoningVisibility === undefined ? {} : { reasoningVisibility: preferences.reasoningVisibility },
                            favorites: preferences.favorites,
                            hidden: preferences.hidden,
                            pinned: preferences.pinned,
                            models: Object.keys(preferences.models),
                            ...preferences.routing === undefined ? {} : { routing: preferences.routing },
                            ...preferences.advanced === undefined ? {} : { advanced: preferences.advanced },
                            ui: preferences.ui,
                        },
                    });
                }
                case RPC_ENDPOINTS.catalogStatus: {
                    const catalog = options.catalog();
                    return ok({ catalog: catalog.status(), preferences: options.preferences() });
                }
                case RPC_ENDPOINTS.catalogRefresh: {
                    const catalog = options.catalog();
                    const result = await catalog.refresh('manual', { signal });
                    return ok({ result, catalog: catalog.status() });
                }
                case RPC_ENDPOINTS.credentialStatus:
                    return ok(await credentialStatus(options));
                case RPC_ENDPOINTS.credentialSet: {
                    const value = payloadString(payload, 'value', 8_192);
                    if (value === undefined)
                        return fail('invalid-request', 'the credential value is empty');
                    const config = options.config();
                    if (config.apiKeyEnv === undefined) {
                        return fail('invalid-request', 'this route resolves no credential reference; name one in apiKeyEnv first');
                    }
                    const credentials = options.credentials();
                    if (credentials === undefined) {
                        return fail('unavailable', 'this deployment has no credentials service; export the reference instead');
                    }
                    let key;
                    try {
                        key = assertUsableApiKey(value, 'llm-nanogpt', String(config.apiKeyEnv));
                    }
                    catch (error) {
                        return fail('INVALID_CREDENTIAL', error instanceof Error ? error.message : 'the key is unusable');
                    }
                    try {
                        await credentials.set(credentialRef(String(config.apiKeyEnv)), key);
                    }
                    catch (error) {
                        return fail('WRITE_FAILED', error instanceof Error ? error.message : 'storing the credential failed');
                    }
                    return ok(await credentialStatus(options));
                }
                case RPC_ENDPOINTS.credentialRemove: {
                    const config = options.config();
                    if (config.apiKeyEnv === undefined)
                        return ok({ configured: false, writable: false });
                    const credentials = options.credentials();
                    if (credentials === undefined)
                        return fail('unavailable', 'this deployment has no credentials service');
                    try {
                        await credentials.unset(credentialRef(String(config.apiKeyEnv)));
                    }
                    catch (error) {
                        return fail('WRITE_FAILED', error instanceof Error ? error.message : 'removing the credential failed');
                    }
                    return ok(await credentialStatus(options));
                }
                case RPC_ENDPOINTS.connectionTest: {
                    const config = options.config();
                    const draft = payloadString(payload, 'apiKey', 8_192);
                    let apiKey;
                    if (draft !== undefined) {
                        try {
                            apiKey = assertUsableApiKey(draft, 'llm-nanogpt', 'connection test');
                        }
                        catch (error) {
                            return ok({
                                status: 'invalid-key',
                                authenticated: false,
                                message: error instanceof Error ? error.message : 'the key is unusable',
                                latencyMs: 0,
                            });
                        }
                    }
                    else if (config.apiKeyEnv !== undefined) {
                        apiKey = await options.resolveCredential(config.apiKeyEnv).catch(() => undefined);
                    }
                    const [test, catalog] = await Promise.all([
                        testConnection({
                            baseURL: config.baseURL,
                            origin: config.origin,
                            ...apiKey === undefined ? {} : { apiKey },
                            timeoutMs: Math.min(config.requestTimeoutMs, 20_000),
                            signal,
                        }, options.discovery),
                        probeCatalog(config.baseURL, options.discovery, { timeoutMs: 15_000, signal }),
                    ]);
                    return ok({
                        ...test,
                        catalogReachable: catalog.reachable,
                        ...catalog.models === undefined ? {} : { catalogModels: catalog.models },
                    });
                }
                case RPC_ENDPOINTS.modelsQuery: {
                    const config = options.config();
                    const preferences = options.preferences();
                    const views = buildModelViews(config, preferences, options.catalog().current());
                    const page = queryModels(views, payload, preferences.ui.showHidden === true);
                    return ok({
                        ...page,
                        catalog: options.catalog().status(),
                        counts: countsOf(views),
                    });
                }
                case RPC_ENDPOINTS.modelsGet: {
                    const id = payloadString(payload, 'id', 200);
                    if (id === undefined)
                        return fail('invalid-request', 'a model id is required');
                    const config = options.config();
                    const preferences = options.preferences();
                    const views = buildModelViews(config, preferences, options.catalog().current());
                    const view = views.find((entry) => entry.model.id === id || entry.model.aliases.includes(id));
                    if (view === undefined)
                        return fail('UNKNOWN_MODEL', `NanoGPT model "${id}" is not in the catalog or preferences`);
                    let resolved;
                    try {
                        resolved = await options.adapter.resolveModel('nanogpt', view.model.id, signal);
                    }
                    catch (error) {
                        resolved = { failure: failureOf(error) };
                    }
                    return ok({
                        summary: modelSummary(view),
                        model: view.model,
                        reasoning: view.reasoning === undefined ? null : { ...view.reasoning, efforts: effortView(view.reasoning) },
                        protocol: view.protocol,
                        routing: view.routing,
                        advanced: view.advanced,
                        resolved,
                        ...view.userPreference === undefined ? {} : { userPreference: view.userPreference },
                        ...view.deploymentOverride === undefined ? {} : { deploymentOverride: view.deploymentOverride },
                    });
                }
                case RPC_ENDPOINTS.modelsProviders: {
                    const id = payloadString(payload, 'id', 200);
                    if (id === undefined)
                        return fail('invalid-request', 'a model id is required');
                    const catalog = await options.adapter.providerCatalogForModel(id, signal);
                    if (catalog === undefined) {
                        return ok({
                            status: 'unsupported',
                            message: 'This model does not expose NanoGPT provider discovery, or provider selection is unavailable.',
                        });
                    }
                    return ok({ status: 'ok', catalog });
                }
                case RPC_ENDPOINTS.preferencesGet:
                    return ok({ preferences: options.preferences() });
                case RPC_ENDPOINTS.preferencesUpdate: {
                    const decoded = decodePreferencesPatch(payload);
                    const result = await options.store.update(decoded.patch, decoded.revision);
                    options.onPreferencesChanged?.();
                    return ok({ preferences: result.preferences, revision: result.preferences.revision });
                }
                case RPC_ENDPOINTS.preferencesExport:
                    return ok({ document: options.store.export() });
                case RPC_ENDPOINTS.preferencesImport: {
                    const document = payload.document;
                    if (!isRecord(document))
                        return fail('invalid-request', 'an imported preferences document must be a JSON object');
                    const revision = payloadInteger(payload, 'revision', 1, Number.MAX_SAFE_INTEGER);
                    const result = await options.store.import(document, revision);
                    options.onPreferencesChanged?.();
                    return ok({ preferences: result.preferences, revision: result.preferences.revision });
                }
                case RPC_ENDPOINTS.usageRead:
                    return ok(await accountViews(options, signal));
                case RPC_ENDPOINTS.defaultSet: {
                    const id = payloadString(payload, 'model', 200);
                    if (id === undefined)
                        return fail('invalid-request', 'a model id is required');
                    const service = options.agentDefaultModel?.();
                    if (service === undefined || typeof service.saveSelection !== 'function') {
                        return fail('unavailable', 'this deployment has no default-model service or configuration editor; set agent-default-model in the profile patch instead');
                    }
                    const config = options.config();
                    const views = buildModelViews(config, options.preferences(), options.catalog().current());
                    const view = views.find((entry) => entry.model.id === id);
                    if (view === undefined) {
                        return fail('UNKNOWN_MODEL', `NanoGPT model "${id}" is not in the catalog or declared overrides`);
                    }
                    let requested = payloadString(payload, 'reasoningEffort', 32);
                    if (requested === 'off')
                        requested = 'none';
                    if (requested === 'auto')
                        requested = undefined;
                    if (requested !== undefined) {
                        const resolved = await options.adapter.resolveModel('nanogpt', view.model.id, signal);
                        const offered = resolved.reasoning?.efforts.map((effort) => String(effort.id)) ?? [];
                        if (!offered.includes(requested)) {
                            return fail('UNSUPPORTED_REASONING_EFFORT', `model "${view.model.id}" does not offer reasoning effort "${requested}"; available: ${offered.join(', ') || 'provider default only'}`);
                        }
                    }
                    try {
                        await service.saveSelection({
                            provider: 'nanogpt',
                            model: view.model.id,
                            ...requested === undefined ? {} : { reasoningEffort: requested },
                        });
                    }
                    catch (error) {
                        return fail('WRITE_FAILED', error instanceof Error ? error.message : 'the default-model selection could not be saved');
                    }
                    const after = service.currentSelection();
                    return ok({
                        agentDefault: agentDefaultView(options),
                        persisted: after.provider === 'nanogpt' && after.model === view.model.id,
                        ...after.provider === 'nanogpt' && after.model === view.model.id
                            ? {}
                            : { message: 'the deployment accepted the call but its configuration editor kept the previous selection' },
                    });
                }
                case RPC_ENDPOINTS.diagnosticsList:
                    return ok({ entries: options.adapter.diagnosticsBuffer().list(), limit: 50 });
                case RPC_ENDPOINTS.diagnosticsClear:
                    options.adapter.diagnosticsBuffer().clear();
                    return ok({ cleared: true });
                case RPC_ENDPOINTS.requestPreview: {
                    const id = payloadString(payload, 'model', 200);
                    if (id === undefined)
                        return fail('invalid-request', 'a model id is required');
                    const effort = payloadString(payload, 'reasoningEffort', 32);
                    const maxTokens = payloadInteger(payload, 'maxTokens', 1, 1_000_000);
                    const wire = await options.adapter.preview({
                        provider: 'nanogpt',
                        model: id,
                        ...effort === undefined ? {} : { reasoningEffort: effort },
                        messages: [
                            {
                                role: 'user',
                                content: [{ type: 'text', text: 'Preview request: summarize the project structure in three bullets.' }],
                            },
                        ],
                        ...maxTokens === undefined ? {} : { maxTokens },
                    });
                    return ok({
                        endpoint: wire.url,
                        protocol: wire.protocol,
                        model: wire.model,
                        ...wire.wireEffort === undefined ? {} : { wireEffort: wire.wireEffort },
                        excludeReasoning: wire.excludeReasoning,
                        ...wire.maxTokens === undefined ? {} : { maxTokens: wire.maxTokens },
                        ...wire.provider === undefined ? {} : { provider: wire.provider },
                        warnings: wire.warnings,
                        headers: sanitizePreviewHeaders(wire.headers),
                        body: wire.body,
                    });
                }
                default:
                    return fail('unknown-endpoint', `unknown NanoGPT endpoint: ${endpoint}`);
            }
        }
        catch (error) {
            options.logger.warn(`llm-nanogpt: RPC ${endpoint} failed: ${error instanceof Error ? error.message : String(error)}`);
            return failureOf(error);
        }
    };
}
