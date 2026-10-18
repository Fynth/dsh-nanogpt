/**
 * Chat Completions stream translation.
 *
 * Provider frames are normalized into DSH blocks while preserving the three
 * independent streams the harness cares about: reasoning, visible text, and
 * tool calls. Tool arguments are accumulated per provider call index and must
 * be valid JSON objects before a tool block is closed.
 *
 * @module dsh-nanogpt/stream/chat
 */
import { LlmError, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm';
import type { CatalogModel } from '../shared.js';
/** Options for one provider-stream translation. */
export interface TranslationOptions {
    /** Exact model being streamed. */
    model: CatalogModel;
    /** Caller cancellation. */
    signal?: AbortSignal;
    /** Maximum idle time between bytes. */
    idleTimeoutMs: number;
    /** Provider request id from response headers. */
    requestId?: string;
    /** Mutable metrics sink the adapter reads after the stream settles. */
    metrics?: {
        usage?: TokenUsage;
        costUsd?: number;
    };
}
/** Build a classified mid-stream failure without echoing provider payload text. */
export declare function streamFailure(payload: Record<string, unknown>, fallbackStatus: number, options: TranslationOptions): LlmError;
/** Translate one Chat Completions SSE body into DSH chunks. */
export declare function translateChatStream(body: ReadableStream<Uint8Array>, options: TranslationOptions): AsyncGenerator<StreamChunk>;
