/**
 * NanoGPT failure classification.
 *
 * Every failure that can reach DSH is an `LlmError` with a stable
 * provider-neutral code plus the HTTP status, retry delay, and provider request
 * id when available. Messages name the model and the actionable cause; they
 * never contain credentials, request bodies, prompts, or tool output.
 *
 * @module dsh-nanogpt/errors
 */
import { LlmError, ProviderRequestId, isContextWindowExceededError, isQuotaExceededError } from '@deepseek-ai/dsh-llm';
import { isRecord, optionalNumber, optionalString } from './catalog.js';
/**
 * Remove credential-shaped material from provider-controlled text before it
 * reaches a log, diagnostic, RPC reply, or error message. Providers sometimes
 * echo a rejected `Authorization` header or an `api_key` form field back.
 * @param value - provider text.
 * @param limit - maximum retained characters.
 * @returns redacted, bounded text.
 */
export function redactSecrets(value, limit = 2_000) {
    if (typeof value !== 'string')
        return '';
    const redacted = value
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{4,}/gi, 'Bearer <redacted>')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, 'sk-<redacted>')
        .replace(/\b(?:ghp_|gho_|ghu_|ghs_|github_pat_)[A-Za-z0-9_]{8,}\b/g, '<redacted>')
        .replace(/((?:x-)?api[_-]?key["']?\s*[:=]\s*["']?)[^\s"',;}]+/gi, '$1<redacted>');
    return redacted.length > limit ? `${redacted.slice(0, limit)}…` : redacted;
}
/** Parse one of NanoGPT's documented error envelopes. */
export function parseProviderError(body, status) {
    if (isRecord(body)) {
        const error = isRecord(body.error) ? body.error : undefined;
        if (error !== undefined) {
            return {
                message: redactSecrets(optionalString(error.message) ?? optionalString(body.message) ?? `HTTP ${status ?? 'error'}`),
                ...optionalString(error.code) === undefined ? {} : { code: redactSecrets(optionalString(error.code) ?? '', 120) },
                ...optionalString(error.type) === undefined ? {} : { type: redactSecrets(optionalString(error.type) ?? '', 120) },
                ...optionalString(error.param) === undefined ? {} : { param: redactSecrets(optionalString(error.param) ?? '', 120) },
            };
        }
        if (typeof body.error === 'string') {
            return {
                message: redactSecrets(body.error),
                ...optionalString(body.status) === undefined ? {} : { code: redactSecrets(optionalString(body.status) ?? '', 120) },
            };
        }
        if (typeof body.message === 'string') {
            return {
                message: redactSecrets(body.message),
                ...optionalString(body.code) === undefined ? {} : { code: redactSecrets(optionalString(body.code) ?? '', 120) },
                ...optionalString(body.type) === undefined ? {} : { type: redactSecrets(optionalString(body.type) ?? '', 120) },
            };
        }
    }
    return { message: `HTTP ${status ?? 'error'}` };
}
/** Parse a `Retry-After` header in seconds or HTTP-date form. */
export function parseRetryAfter(value, now = Date.now()) {
    if (value === null || value === undefined)
        return undefined;
    const trimmed = value.trim();
    if (trimmed.length === 0)
        return undefined;
    const seconds = Number(trimmed);
    if (Number.isFinite(seconds) && seconds >= 0)
        return Math.round(seconds * 1_000);
    const date = Date.parse(trimmed);
    if (Number.isFinite(date)) {
        const delay = date - now;
        return delay > 0 ? delay : undefined;
    }
    return undefined;
}
/** True for a caller cancellation. */
export function isAbortError(error) {
    return ((error instanceof DOMException && error.name === 'AbortError') ||
        (isRecord(error) && (error.name === 'AbortError' || error.name === 'TimeoutError')));
}
/** Flatten an error cause chain for a diagnostic surface, never for routing. */
export function errorChain(error) {
    const parts = [];
    let current = error;
    for (let depth = 0; depth < 5 && current !== undefined && current !== null; depth += 1) {
        if (current instanceof Error) {
            if (current.message.length > 0 && !parts.includes(current.message))
                parts.push(current.message);
            current = current.cause;
        }
        else if (typeof current === 'string') {
            if (!parts.includes(current))
                parts.push(current);
            break;
        }
        else {
            break;
        }
    }
    return parts.join(': ') || 'unknown failure';
}
/** Stable provider code for a transport failure that produced no response. */
export function transportFailure(error, signal) {
    if (signal?.aborted === true || isAbortError(error)) {
        return new LlmError('the NanoGPT request was cancelled', 'ABORTED', { cause: error });
    }
    const chain = errorChain(error);
    const detail = chain.toLowerCase();
    const timeout = detail.includes('timeout') || detail.includes('timed out');
    return new LlmError(timeout ? `NanoGPT request timed out: ${chain}` : `NanoGPT transport failure: ${chain}`, timeout ? 'TIMEOUT' : 'TRANSPORT', { cause: error });
}
/** Map an HTTP status plus provider envelope to a stable LLM failure code. */
export function failureCodeFor(status, details) {
    const providerCode = details.code ?? '';
    const detail = `${providerCode} ${details.type ?? ''} ${details.message}`;
    if (status === 401 || status === 403) {
        return 'AUTH';
    }
    if (status === 402) {
        return 'QUOTA';
    }
    if (status === 429) {
        return 'RATE_LIMIT';
    }
    if (status === 408 || status === 504) {
        return 'TIMEOUT';
    }
    if (status >= 500) {
        return 'SERVER';
    }
    if (providerCode === 'context_length_exceeded' || isContextWindowExceededError(detail)) {
        return 'CONTEXT_WINDOW_EXCEEDED';
    }
    if (providerCode === 'reasoning_required' ||
        providerCode === 'unsupported_reasoning_effort' ||
        providerCode === 'invalid_reasoning_effort') {
        return 'UNSUPPORTED_REASONING_EFFORT';
    }
    if (providerCode === 'empty_response') {
        return 'EMPTY_RESPONSE';
    }
    if (isQuotaExceededError(detail) ||
        providerCode === 'memory_balance_required' ||
        providerCode === 'webSearch_balance_required' ||
        providerCode === 'both_balance_required' ||
        providerCode === 'insufficient_balance') {
        return 'QUOTA';
    }
    if (providerCode.startsWith('daily_') && providerCode.endsWith('_limit_exceeded')) {
        return 'RATE_LIMIT';
    }
    if (status === 400 || status === 404 || status === 409 || status === 413 || status === 422) {
        return 'INVALID_REQUEST';
    }
    return `HTTP_${status}`;
}
/** Headers that may carry a provider request id. */
const REQUEST_ID_HEADERS = ['x-request-id', 'request-id', 'x-amzn-requestid', 'cf-ray'];
/** Read the first provider request id header. */
export function requestIdFrom(headers) {
    for (const name of REQUEST_ID_HEADERS) {
        const value = headers.get(name);
        if (value !== null && value.trim().length > 0)
            return value.trim();
    }
    return undefined;
}
/**
 * Build one classified HTTP failure.
 * @param status - response status.
 * @param body - decoded body, when JSON parsing succeeded.
 * @param headers - response headers.
 * @param model - exact model id for the message.
 * @returns an `LlmError` carrying serializable facts.
 */
export function httpFailure(status, body, headers, model) {
    const details = parseProviderError(body, status);
    const code = failureCodeFor(status, details);
    const retryAfterMs = parseRetryAfter(headers.get('retry-after'));
    const requestId = requestIdFrom(headers);
    const hint = code === 'AUTH'
        ? ' Check the NanoGPT API key in Settings → NanoGPT.'
        : code === 'QUOTA'
            ? ' The NanoGPT account balance or subscription quota is exhausted.'
            : code === 'RATE_LIMIT'
                ? ' NanoGPT asked the client to slow down.'
                : code === 'CONTEXT_WINDOW_EXCEEDED'
                    ? ' Shorten the conversation or choose a larger-context model.'
                    : code === 'UNSUPPORTED_REASONING_EFFORT'
                        ? ' Choose an effort this exact model advertises, or the provider default.'
                        : '';
    const message = `NanoGPT request for "${model}" failed (HTTP ${status}${details.code === undefined ? '' : `, ${details.code}`}): ${details.message}.${hint}`;
    return new LlmError(message, code, {
        status,
        ...retryAfterMs === undefined ? {} : { providerRetryAfterMs: retryAfterMs },
        ...requestId === undefined ? {} : { requestId: ProviderRequestId(requestId) },
    });
}
/** Read `x_nanogpt_pricing.cost` from a final payload, when present. */
export function reportedCost(payload) {
    if (!isRecord(payload))
        return undefined;
    const pricing = payload.x_nanogpt_pricing;
    if (!isRecord(pricing))
        return undefined;
    return optionalNumber(pricing.cost);
}
