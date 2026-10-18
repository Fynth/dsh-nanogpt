/**
 * Incremental Server-Sent Events parser.
 *
 * Provider chunks are arbitrary byte slices: one chunk may hold half a UTF-8
 * code point, half a JSON object, several events, or only a heartbeat comment.
 * This parser keeps its own text buffer, decodes with a streaming
 * `TextDecoder`, and dispatches only complete SSE frames. It also enforces an
 * idle deadline and caller cancellation on every outstanding read, so a
 * silent provider connection cannot pin a stream open forever.
 *
 * @module dsh-nanogpt/sse
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
/** Maximum retained bytes for one unterminated SSE line or the read buffer. */
export const MAX_SSE_LINE_BYTES = 4 * 1024 * 1024;
/** Maximum retained bytes for one dispatched event's data lines. */
export const MAX_SSE_EVENT_BYTES = 16 * 1024 * 1024;
/** Raised when no bytes arrive within the idle deadline. */
export class SseIdleTimeoutError extends Error {
    /** @param idleTimeoutMs - configured idle budget. */
    constructor(idleTimeoutMs) {
        super(`NanoGPT stream idle timeout after ${idleTimeoutMs} ms`);
        this.name = 'SseIdleTimeoutError';
    }
}
/** One read raced against cancellation and the idle deadline. */
async function readWithDeadline(reader, idleTimeoutMs, signal) {
    if (signal?.aborted === true) {
        throw new LlmError('the NanoGPT stream was cancelled', 'ABORTED');
    }
    let timer;
    let abortListener;
    const timeout = new Promise((_resolve, reject) => {
        timer = setTimeout(() => reject(new SseIdleTimeoutError(idleTimeoutMs)), idleTimeoutMs);
        timer.unref?.();
    });
    const aborted = new Promise((_resolve, reject) => {
        if (signal === undefined)
            return;
        abortListener = () => reject(new LlmError('the NanoGPT stream was cancelled', 'ABORTED'));
        signal.addEventListener('abort', abortListener, { once: true });
    });
    try {
        return await Promise.race([reader.read(), timeout, aborted]);
    }
    finally {
        if (timer !== undefined)
            clearTimeout(timer);
        if (abortListener !== undefined)
            signal?.removeEventListener('abort', abortListener);
    }
}
/**
 * Parse one SSE response body into decoded events.
 * @param stream - response body bytes.
 * @param options - idle deadline and cancellation.
 * @returns decoded events in wire order.
 */
export async function* parseSse(stream, options = {}) {
    const reader = stream.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: false });
    let buffer = '';
    let eventName;
    let id;
    let dataLines = [];
    const idleTimeoutMs = options.idleTimeoutMs ?? 300_000;
    const dispatch = () => {
        const event = dataLines.length === 0
            ? { data: '', ...eventName === undefined ? {} : { event: eventName }, ...id === undefined ? {} : { id } }
            : {
                data: dataLines.join('\n'),
                ...eventName === undefined ? {} : { event: eventName },
                ...id === undefined ? {} : { id },
            };
        dataLines = [];
        eventName = undefined;
        return event.data.length > 0 || event.event !== undefined ? event : undefined;
    };
    try {
        while (true) {
            const result = await readWithDeadline(reader, idleTimeoutMs, options.signal);
            if (result.done)
                break;
            options.onActivity?.();
            buffer += decoder.decode(result.value, { stream: true });
            if (buffer.length > MAX_SSE_LINE_BYTES) {
                throw new LlmError(`NanoGPT stream exceeded the ${Math.round(MAX_SSE_LINE_BYTES / (1024 * 1024))} MiB SSE line buffer`, 'MALFORMED_RESPONSE');
            }
            let newline = buffer.indexOf('\n');
            while (newline !== -1) {
                let line = buffer.slice(0, newline);
                buffer = buffer.slice(newline + 1);
                if (line.length > MAX_SSE_LINE_BYTES) {
                    throw new LlmError('NanoGPT stream sent an oversized SSE line', 'MALFORMED_RESPONSE');
                }
                if (line.endsWith('\r'))
                    line = line.slice(0, -1);
                if (line.length === 0) {
                    const event = dispatch();
                    if (event !== undefined)
                        yield event;
                }
                else if (line.startsWith(':')) {
                    // SSE comment/heartbeat; activity was already pulsed above.
                }
                else {
                    const colon = line.indexOf(':');
                    const field = colon === -1 ? line : line.slice(0, colon);
                    let value = colon === -1 ? '' : line.slice(colon + 1);
                    if (value.startsWith(' '))
                        value = value.slice(1);
                    switch (field) {
                        case 'event':
                            eventName = value;
                            break;
                        case 'data':
                            dataLines.push(value);
                            if (dataLines.reduce((sum, entry) => sum + entry.length, 0) > MAX_SSE_EVENT_BYTES) {
                                throw new LlmError('NanoGPT stream sent an oversized SSE event', 'MALFORMED_RESPONSE');
                            }
                            break;
                        case 'id':
                            id = value;
                            break;
                        case 'retry':
                            break;
                        default:
                            // Unknown fields are ignored, as the SSE specification requires.
                            break;
                    }
                }
                newline = buffer.indexOf('\n');
            }
        }
        buffer += decoder.decode();
        if (buffer.length > 0) {
            let line = buffer;
            if (line.endsWith('\r'))
                line = line.slice(0, -1);
            if (line.startsWith('data:')) {
                let value = line.slice('data:'.length);
                if (value.startsWith(' '))
                    value = value.slice(1);
                dataLines.push(value);
            }
            else if (line.startsWith('event:')) {
                eventName = line.slice('event:'.length).trim();
            }
        }
        const tail = dispatch();
        if (tail !== undefined)
            yield tail;
    }
    finally {
        try {
            await reader.cancel();
        }
        catch {
            // The body may already be closed; nothing remains to release.
        }
        reader.releaseLock();
    }
}
/** Decode one SSE data payload as a JSON object without echoing its content on failure. */
export function parseJsonEvent(event, protocol) {
    let value;
    try {
        value = JSON.parse(event.data);
    }
    catch {
        throw new LlmError(`NanoGPT ${protocol} stream sent an unparseable${event.event === undefined ? '' : ` "${event.event}"`} event`, 'MALFORMED_RESPONSE');
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        throw new LlmError(`NanoGPT ${protocol} stream sent a non-object event`, 'MALFORMED_RESPONSE');
    }
    return value;
}
/** True when an event is the Chat Completions terminator. */
export function isDoneEvent(event) {
    return event.data.trim() === '[DONE]';
}
