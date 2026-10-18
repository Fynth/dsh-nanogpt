/**
 * Responses stream translation.
 *
 * The terminal `response.completed` object carries the authoritative usage and
 * the complete output-item list; incremental frames are normalized into DSH
 * blocks as they arrive, and the final output is used only to fill content the
 * endpoint did not stream. Completed output items are retained in replay state
 * so opaque reasoning can be replayed on the same model.
 *
 * @module dsh-nanogpt/stream/responses
 */
import { type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { TranslationOptions } from './chat.js';
/** Translate one Responses SSE body into DSH chunks. */
export declare function translateResponsesStream(body: ReadableStream<Uint8Array>, options: TranslationOptions): AsyncGenerator<StreamChunk>;
