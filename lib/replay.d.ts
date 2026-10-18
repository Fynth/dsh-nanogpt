/**
 * Adapter-private replay metadata.
 *
 * DSH stores one opaque envelope on every successful assistant message and
 * hands it back only to the adapter instance that produced it. NanoGPT uses it
 * for three facts that are not representable in the provider-neutral content
 * blocks: the provider response id, Anthropic thinking signatures required for
 * tool continuation, and completed Responses output items (including opaque
 * encrypted reasoning) for stateless replay.
 *
 * @module dsh-nanogpt/replay
 */
import type { Message, ReplayEnvelope } from '@deepseek-ai/dsh-llm';
import type { Protocol } from './shared.js';
/** One block's native metadata, aligned with emitted block order. */
export interface ReplayBlock {
    type: 'text' | 'reasoning' | 'tool-call';
    /** Anthropic thinking signature. */
    signature?: string;
    /** Provider block/call id, when disclosed. */
    id?: string;
}
/** Versioned envelope this adapter writes. */
export interface NanoReplay {
    v: 1;
    protocol: Protocol;
    /** Requested model id. */
    model: string;
    /** Provider-returned response id. */
    responseId?: string;
    /** Provider-native stop reason. */
    nativeStopReason?: string;
    /** Response model id, when it differs from the request. */
    providerModel?: string;
    /** Per-block metadata in emitted order. */
    blocks: ReplayBlock[];
    /** Complete Responses output items for stateless replay. */
    outputItems?: unknown[];
}
/** Build one replay envelope. */
export declare function makeReplay(input: Omit<NanoReplay, 'v'>): ReplayEnvelope;
/** Read the envelope from one durable assistant message. */
export declare function readReplay(message: Message, protocol: Protocol, model: string): NanoReplay | undefined;
/** Read one block's native metadata by emitted block index. */
export declare function replayBlock(replay: NanoReplay | undefined, index: number): ReplayBlock | undefined;
