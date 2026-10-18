/**
 * Anthropic Messages stream translation.
 *
 * Named SSE events are normalized into the same DSH blocks as the other
 * transports. Thinking signatures are captured per block and stored in replay
 * state; without a signature the reasoning block is still shown to the user but
 * is not replayed as an Anthropic thinking block on the next request.
 *
 * @module dsh-nanogpt/stream/messages
 */
import { type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { TranslationOptions } from './chat.js';
/** Translate one Messages SSE body into DSH chunks. */
export declare function translateMessagesStream(body: ReadableStream<Uint8Array>, options: TranslationOptions): AsyncGenerator<StreamChunk>;
