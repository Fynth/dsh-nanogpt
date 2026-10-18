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
import { LlmError } from '@deepseek-ai/dsh-llm';
/** Extracted provider error envelope. */
export interface ProviderErrorDetails {
    message: string;
    code?: string;
    type?: string;
    param?: string;
}
/**
 * Remove credential-shaped material from provider-controlled text before it
 * reaches a log, diagnostic, RPC reply, or error message. Providers sometimes
 * echo a rejected `Authorization` header or an `api_key` form field back.
 * @param value - provider text.
 * @param limit - maximum retained characters.
 * @returns redacted, bounded text.
 */
export declare function redactSecrets(value: string, limit?: number): string;
/** Parse one of NanoGPT's documented error envelopes. */
export declare function parseProviderError(body: unknown, status?: number): ProviderErrorDetails;
/** Parse a `Retry-After` header in seconds or HTTP-date form. */
export declare function parseRetryAfter(value: string | null | undefined, now?: number): number | undefined;
/** True for a caller cancellation. */
export declare function isAbortError(error: unknown): boolean;
/** Flatten an error cause chain for a diagnostic surface, never for routing. */
export declare function errorChain(error: unknown): string;
/** Stable provider code for a transport failure that produced no response. */
export declare function transportFailure(error: unknown, signal?: AbortSignal): LlmError;
/** Map an HTTP status plus provider envelope to a stable LLM failure code. */
export declare function failureCodeFor(status: number, details: ProviderErrorDetails): string;
/** Read the first provider request id header. */
export declare function requestIdFrom(headers: Headers): string | undefined;
/**
 * Build one classified HTTP failure.
 * @param status - response status.
 * @param body - decoded body, when JSON parsing succeeded.
 * @param headers - response headers.
 * @param model - exact model id for the message.
 * @returns an `LlmError` carrying serializable facts.
 */
export declare function httpFailure(status: number, body: unknown, headers: Headers, model: string): LlmError;
/** Read `x_nanogpt_pricing.cost` from a final payload, when present. */
export declare function reportedCost(payload: unknown): number | undefined;
