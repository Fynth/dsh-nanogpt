/** Fetch implementation; injectable for tests. */
export type FetchLike = typeof fetch;
/** One JSON request. */
export interface JsonRequest {
    url: string;
    method?: 'GET' | 'POST' | 'PATCH';
    headers?: Record<string, string>;
    body?: string;
    signal?: AbortSignal;
    timeoutMs?: number;
    maxBytes?: number;
    fetch?: FetchLike;
}
/** One decoded JSON answer with the response facts callers need. */
export interface JsonResponse {
    status: number;
    headers: Headers;
    body: unknown;
    text: string;
    bytes: number;
}
/** Build a combined signal that aborts on caller cancellation or the attempt deadline. */
export declare function attemptSignal(signal: AbortSignal | undefined, timeoutMs: number): {
    signal: AbortSignal;
    dispose: () => void;
};
/** Read a response body with a hard byte cap. */
export declare function readBodyBounded(response: Response, maxBytes: number): Promise<{
    text: string;
    bytes: number;
}>;
/**
 * Perform one bounded JSON request.
 * @param request - URL, method, headers, body, cancellation and limits.
 * @returns decoded status, headers, and body.
 * @throws LlmError classified for transport, timeout, or non-2xx HTTP failures.
 */
export declare function requestJson(request: JsonRequest): Promise<JsonResponse>;
/** Standard authentication/attribution headers for one authenticated request. */
export declare function authenticatedHeaders(apiKey: string | undefined, attribution: Record<string, string>): Record<string, string>;
/**
 * Account-endpoint headers. The public API document advertises both a bearer
 * scheme and an `x-api-key` scheme; account endpoints are documented with the
 * latter in places, so send both forms rather than reporting a valid key as
 * invalid because one carrier was absent. The key still travels only to the
 * configured NanoGPT origin.
 */
export declare function accountHeaders(apiKey: string | undefined, attribution: Record<string, string>): Record<string, string>;
/** Standard headers for a streaming JSON request. */
export declare function streamingHeaders(apiKey: string | undefined, attribution: Record<string, string>): Record<string, string>;
/** Read an HTTP-date/Retry-After value from one response, without throwing. */
export declare function retryAfterMs(headers: Headers): number | undefined;
