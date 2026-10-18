/** One decoded SSE event. */
export interface SseEvent {
    /** `event:` field, when the endpoint sends named events. */
    event?: string;
    /** Concatenated `data:` lines. */
    data: string;
    /** `id:` field, when present. */
    id?: string;
}
/** Maximum retained bytes for one unterminated SSE line or the read buffer. */
export declare const MAX_SSE_LINE_BYTES: number;
/** Maximum retained bytes for one dispatched event's data lines. */
export declare const MAX_SSE_EVENT_BYTES: number;
/** Options for one stream parse. */
export interface SseParseOptions {
    /** Maximum time to wait for the next byte, in milliseconds. */
    idleTimeoutMs?: number;
    /** Caller cancellation. */
    signal?: AbortSignal;
    /** Called on every received chunk, including comments and heartbeats. */
    onActivity?: () => void;
}
/** Raised when no bytes arrive within the idle deadline. */
export declare class SseIdleTimeoutError extends Error {
    /** @param idleTimeoutMs - configured idle budget. */
    constructor(idleTimeoutMs: number);
}
/**
 * Parse one SSE response body into decoded events.
 * @param stream - response body bytes.
 * @param options - idle deadline and cancellation.
 * @returns decoded events in wire order.
 */
export declare function parseSse(stream: ReadableStream<Uint8Array>, options?: SseParseOptions): AsyncGenerator<SseEvent>;
/** Decode one SSE data payload as a JSON object without echoing its content on failure. */
export declare function parseJsonEvent(event: SseEvent, protocol: string): Record<string, unknown>;
/** True when an event is the Chat Completions terminator. */
export declare function isDoneEvent(event: SseEvent): boolean;
