/**
 * NanoGPT endpoint interrogation.
 *
 * Three independent reads live here: the detailed model catalog, the
 * per-model provider-discovery answer, and the authenticated connection test.
 * The connection test never treats a public catalog response as proof of
 * authentication: the catalog is anonymous by design, so the test asks an
 * authenticated, non-inference endpoint instead.
 *
 * @module dsh-nanogpt/discovery
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
import { isRecord, normalizeCatalogResponse, normalizeEfforts, optionalBoolean, optionalNumber, optionalNumeric, optionalPositiveInteger, optionalString } from './catalog.js';
import { accountHeaders, authenticatedHeaders, requestJson, } from './http.js';
import { balanceEndpoint, modelsEndpoint, providersEndpoint, } from './config.js';
import { usageQuery } from './usage.js';
/**
 * Fetch and normalize the detailed model catalog.
 * @param request - endpoint, optional one-shot credential, timeout and cancellation.
 * @param deps - fetch and attribution.
 * @returns the normalized snapshot.
 */
export async function fetchCatalog(request, deps) {
    const endpoint = modelsEndpoint(request.baseURL);
    const response = await requestJson({
        url: endpoint,
        headers: authenticatedHeaders(request.apiKey, deps.attribution),
        timeoutMs: request.timeoutMs,
        maxBytes: 32 * 1024 * 1024,
        ...deps.fetch === undefined ? {} : { fetch: deps.fetch },
        ...request.signal === undefined ? {} : { signal: request.signal },
    });
    const fetchedAt = new Date().toISOString();
    try {
        return normalizeCatalogResponse(response.body, endpoint, fetchedAt).snapshot;
    }
    catch (error) {
        throw new LlmError(error instanceof Error ? `NanoGPT catalog response is unusable: ${error.message}` : 'NanoGPT catalog response is unusable', 'MALFORMED_RESPONSE', { cause: error });
    }
}
/** Read a per-1k rate from a route pricing object. */
function perMillion(value) {
    const number = optionalNumber(value);
    return number === undefined ? undefined : number * 1_000;
}
/** Normalize one provider row. */
export function normalizeProviderRoute(raw) {
    const id = optionalString(raw.provider);
    if (id === undefined)
        return undefined;
    const features = isRecord(raw.features) ? raw.features : undefined;
    const pricing = isRecord(raw.pricing) ? raw.pricing : undefined;
    const effectivePricing = isRecord(raw.effectivePricing) ? raw.effectivePricing : undefined;
    const effective = isRecord(effectivePricing?.effective_price) ? effectivePricing.effective_price : undefined;
    const price = {};
    const input = perMillion(pricing?.inputPer1kTokens) ?? perMillion(effective?.inputPer1kTokens);
    const output = perMillion(pricing?.outputPer1kTokens) ?? perMillion(effective?.outputPer1kTokens);
    const cacheRead = perMillion(pricing?.cacheReadInputPer1kTokens) ?? perMillion(effective?.cacheReadInputPer1kTokens);
    const cacheWrite = perMillion(pricing?.cacheWriteInputPer1kTokens) ?? perMillion(effective?.cacheWriteInputPer1kTokens);
    if (input !== undefined)
        price.input = input;
    if (output !== undefined)
        price.output = output;
    if (cacheRead !== undefined)
        price.cacheRead = cacheRead;
    if (cacheWrite !== undefined)
        price.cacheWrite = cacheWrite;
    const efforts = normalizeEfforts(raw.supportedReasoningEfforts) ??
        normalizeEfforts(features?.reasoningEfforts) ??
        normalizeEfforts(features?.reasoning_efforts);
    const route = {
        id,
        ...optionalString(raw.displayName) === undefined ? {} : { displayName: optionalString(raw.displayName) },
        available: optionalBoolean(raw.available) ?? true,
        ...optionalPositiveInteger(raw.maxInputTokens) === undefined
            ? {}
            : { maxInputTokens: optionalPositiveInteger(raw.maxInputTokens) },
        ...optionalPositiveInteger(raw.maxOutputTokens) === undefined
            ? {}
            : { maxOutputTokens: optionalPositiveInteger(raw.maxOutputTokens) },
        ...efforts === undefined ? {} : { reasoningEfforts: efforts },
        ...optionalBoolean(features?.reasoningAlwaysOn) === undefined
            ? optionalBoolean(raw.reasoningAlwaysOn) === undefined
                ? {}
                : { reasoningAlwaysOn: optionalBoolean(raw.reasoningAlwaysOn) }
            : { reasoningAlwaysOn: optionalBoolean(features?.reasoningAlwaysOn) },
        ...optionalBoolean(features?.toolCalling) === undefined
            ? optionalBoolean(raw.supportsTools) === undefined
                ? {}
                : { supportsTools: optionalBoolean(raw.supportsTools) }
            : { supportsTools: optionalBoolean(features?.toolCalling) },
        ...optionalBoolean(features?.imageInput) === undefined
            ? optionalBoolean(raw.supportsNonTextMediaInput) === undefined
                ? {}
                : { supportsImages: optionalBoolean(raw.supportsNonTextMediaInput) }
            : { supportsImages: optionalBoolean(features?.imageInput) },
        ...optionalBoolean(features?.promptCaching) === undefined
            ? optionalBoolean(raw.supportsPromptCaching) === undefined
                ? {}
                : { supportsPromptCaching: optionalBoolean(raw.supportsPromptCaching) }
            : { supportsPromptCaching: optionalBoolean(features?.promptCaching) },
        ...optionalBoolean(features?.structuredOutput) === undefined
            ? optionalBoolean(raw.supportsStructuredOutput) === undefined
                ? {}
                : { supportsStructuredOutput: optionalBoolean(raw.supportsStructuredOutput) }
            : { supportsStructuredOutput: optionalBoolean(features?.structuredOutput) },
        ...optionalString(raw.quantization) === undefined ? {} : { quantization: optionalString(raw.quantization) },
        ...optionalNumber(raw.tps) === undefined ? {} : { tps: optionalNumber(raw.tps) },
        ...optionalNumber(raw.ttftMs) === undefined ? {} : { ttftMs: optionalNumber(raw.ttftMs) },
        ...input === undefined && output === undefined && cacheRead === undefined && cacheWrite === undefined
            ? {}
            : { pricing: price },
        ...optionalString(pricing?.currency) === undefined && optionalString(effectivePricing?.currency) === undefined
            ? {}
            : { currency: optionalString(pricing?.currency) ?? optionalString(effectivePricing?.currency) },
        ...optionalString(raw.privacy) === undefined ? {} : { privacy: optionalString(raw.privacy) },
        ...optionalString(raw.region) === undefined ? {} : { region: optionalString(raw.region) },
        priceIncludesMarkup: true,
    };
    return route;
}
/** Read one provider-discovery answer. */
export async function fetchProviderCatalog(origin, modelId, deps, options) {
    const endpoint = providersEndpoint(origin, modelId);
    try {
        const response = await requestJson({
            url: endpoint,
            headers: authenticatedHeaders(options.apiKey, deps.attribution),
            timeoutMs: options.timeoutMs,
            maxBytes: 4 * 1024 * 1024,
            ...deps.fetch === undefined ? {} : { fetch: deps.fetch },
            ...options.signal === undefined ? {} : { signal: options.signal },
        });
        if (!isRecord(response.body)) {
            return { status: 'error', failure: { code: 'MALFORMED_RESPONSE', message: 'provider discovery returned a non-object body', status: response.status } };
        }
        const rows = Array.isArray(response.body.providers) ? response.body.providers : [];
        const providers = rows
            .filter(isRecord)
            .map(normalizeProviderRoute)
            .filter((route) => route !== undefined);
        const defaultPriceObject = isRecord(response.body.defaultPrice) ? response.body.defaultPrice : undefined;
        const defaultPricing = {};
        const defaultInput = perMillion(defaultPriceObject?.inputPer1kTokens);
        const defaultOutput = perMillion(defaultPriceObject?.outputPer1kTokens);
        const defaultCacheRead = perMillion(defaultPriceObject?.cacheReadInputPer1kTokens);
        if (defaultInput !== undefined)
            defaultPricing.input = defaultInput;
        if (defaultOutput !== undefined)
            defaultPricing.output = defaultOutput;
        if (defaultCacheRead !== undefined)
            defaultPricing.cacheRead = defaultCacheRead;
        return {
            status: 'ok',
            catalog: {
                model: optionalString(response.body.canonicalId) ?? modelId,
                ...optionalString(response.body.displayName) === undefined ? {} : { displayName: optionalString(response.body.displayName) },
                supportsProviderSelection: response.body.supportsProviderSelection === true,
                ...defaultInput === undefined && defaultOutput === undefined && defaultCacheRead === undefined
                    ? {}
                    : { defaultPricing },
                providers,
                fetchedAt: new Date().toISOString(),
                source: 'api',
            },
        };
    }
    catch (error) {
        if (error instanceof LlmError) {
            if (error.failure.status === 404 || error.failure.status === 405) {
                return {
                    status: 'unsupported',
                    message: 'this endpoint does not expose NanoGPT provider discovery (models without provider selection do not need it)',
                };
            }
            return {
                status: 'error',
                failure: {
                    code: error.code,
                    message: error.message,
                    ...error.failure.status === undefined ? {} : { status: error.failure.status },
                },
            };
        }
        return { status: 'error', failure: { code: 'TRANSPORT', message: error instanceof Error ? error.message : 'provider discovery failed' } };
    }
}
/** Classify one authenticated-read failure for the connection test. */
function classifyTestFailure(error, latencyMs, endpoint) {
    if (error instanceof LlmError) {
        const status = error.failure.status;
        const requestId = error.failure.requestId;
        if (status === 401 || status === 403) {
            return {
                status: 'invalid-key',
                authenticated: false,
                message: 'NanoGPT rejected the API key (HTTP 401/403). Replace the key in Settings → NanoGPT.',
                endpoint,
                latencyMs,
                ...status === undefined ? {} : { httpStatus: status },
            };
        }
        if (status === 402) {
            return {
                status: 'insufficient-funds',
                authenticated: true,
                message: 'The key is valid, but NanoGPT reports an insufficient balance or quota for this account.',
                endpoint,
                latencyMs,
                httpStatus: 402,
            };
        }
        if (status === 429) {
            return {
                status: 'rate-limited',
                authenticated: false,
                message: 'NanoGPT rate-limited the connection test; the key could not be verified yet. Try again later.',
                endpoint,
                latencyMs,
                httpStatus: 429,
            };
        }
        if (status === 404 || status === 405) {
            return {
                status: 'unsupported',
                authenticated: false,
                message: 'The configured endpoint does not expose the authenticated balance/usage endpoints NanoGPT documents.',
                endpoint,
                latencyMs,
                httpStatus: status,
            };
        }
        if (status !== undefined && status >= 500) {
            return {
                status: 'provider-unavailable',
                authenticated: false,
                message: `NanoGPT is unavailable (HTTP ${status}); the key was not verified.`,
                endpoint,
                latencyMs,
                httpStatus: status,
            };
        }
        if (error.code === 'TIMEOUT') {
            return { status: 'timeout', authenticated: false, message: 'The NanoGPT endpoint did not answer in time.', endpoint, latencyMs };
        }
        if (error.code === 'TRANSPORT') {
            return { status: 'network', authenticated: false, message: error.message, endpoint, latencyMs };
        }
        return {
            status: 'unknown-failure',
            authenticated: false,
            message: error.message,
            endpoint,
            latencyMs,
            ...status === undefined ? {} : { httpStatus: status },
            ...requestId === undefined ? {} : { requestId },
        };
    }
    return {
        status: 'unknown-failure',
        authenticated: false,
        message: error instanceof Error ? error.message : 'connection test failed',
        endpoint,
        latencyMs,
    };
}
/**
 * Prove or disprove authentication with an authenticated, non-inference read.
 *
 * Order: `POST /api/check-balance` (documented account read, no model tokens),
 * then `GET /api/v1/usage` (documented authenticated aggregate) when the
 * balance path is absent. A public catalog read is attempted separately and is
 * never used to claim authentication.
 *
 * @param request - endpoint, credential, timeout, cancellation.
 * @param deps - fetch and attribution.
 * @returns categorized result for the UI.
 */
export async function testConnection(request, deps) {
    const started = Date.now();
    const balanceUrl = balanceEndpoint(request.origin);
    if (request.apiKey === undefined) {
        return {
            status: 'invalid-key',
            authenticated: false,
            message: 'No NanoGPT API key is configured. Add a key in Settings → NanoGPT or export NANOGPT_API_KEY.',
            endpoint: balanceUrl,
            latencyMs: 0,
        };
    }
    const common = {
        headers: {
            ...accountHeaders(request.apiKey, deps.attribution),
            'Content-Type': 'application/json',
        },
        timeoutMs: request.timeoutMs,
        maxBytes: 512 * 1024,
        ...deps.fetch === undefined ? {} : { fetch: deps.fetch },
        ...request.signal === undefined ? {} : { signal: request.signal },
    };
    try {
        const response = await requestJson({ url: balanceUrl, method: 'POST', body: '{}', ...common });
        const latencyMs = Date.now() - started;
        const body = response.body;
        const usd = isRecord(body)
            ? optionalNumeric(body.usd_balance) ??
                optionalNumeric(body.usdBalance) ??
                optionalNumeric(body.usd) ??
                optionalNumeric(isRecord(body.balance) ? body.balance.usd : undefined)
            : undefined;
        return {
            status: 'connected',
            authenticated: true,
            message: 'Connected. NanoGPT accepted the API key on an authenticated account endpoint.',
            endpoint: balanceUrl,
            latencyMs,
            httpStatus: response.status,
            ...usd === undefined ? {} : { balanceUsd: usd },
        };
    }
    catch (error) {
        const latencyMs = Date.now() - started;
        const failure = classifyTestFailure(error, latencyMs, balanceUrl);
        if (failure.status !== 'unsupported')
            return failure;
    }
    // Fall back to the aggregate usage endpoint when the balance path is absent.
    const usageUrl = usageQuery(request.baseURL);
    const fallbackStarted = Date.now();
    try {
        const response = await requestJson({
            url: usageUrl,
            headers: accountHeaders(request.apiKey, deps.attribution),
            timeoutMs: request.timeoutMs,
            maxBytes: 256 * 1024,
            ...deps.fetch === undefined ? {} : { fetch: deps.fetch },
            ...request.signal === undefined ? {} : { signal: request.signal },
        });
        return {
            status: 'connected',
            authenticated: true,
            message: 'Connected. NanoGPT accepted the API key on the authenticated usage endpoint.',
            endpoint: usageUrl,
            latencyMs: Date.now() - fallbackStarted,
            httpStatus: response.status,
        };
    }
    catch (error) {
        return classifyTestFailure(error, Date.now() - fallbackStarted, usageUrl);
    }
}
/** Probe the public catalog without using it as authentication evidence. */
export async function probeCatalog(baseURL, deps, options = { timeoutMs: 10_000 }) {
    try {
        const response = await requestJson({
            url: modelsEndpoint(baseURL),
            headers: { ...deps.attribution, Accept: 'application/json' },
            timeoutMs: options.timeoutMs,
            maxBytes: 32 * 1024 * 1024,
            ...deps.fetch === undefined ? {} : { fetch: deps.fetch },
            ...options.signal === undefined ? {} : { signal: options.signal },
        });
        const body = response.body;
        const count = isRecord(body) && Array.isArray(body.data) ? body.data.length : undefined;
        return { reachable: true, ...count === undefined ? {} : { models: count } };
    }
    catch (error) {
        if (error instanceof LlmError) {
            return { reachable: false, failure: { code: error.code, message: error.message, ...error.failure.status === undefined ? {} : { status: error.failure.status } } };
        }
        return { reachable: false, failure: { code: 'TRANSPORT', message: error instanceof Error ? error.message : 'catalog probe failed' } };
    }
}
