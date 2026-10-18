/**
 * Stream block assembly.
 *
 * DSH's `StreamChunk` protocol is index-correlated: a block-start opens one
 * index, deltas append to it, and a block-end carries the assembled block.
 * This helper keeps that bookkeeping in one place so the three protocol
 * translators cannot drift on block ordering, tool-call accumulation, or replay
 * metadata alignment.
 *
 * @module dsh-nanogpt/stream/blocks
 */
import { type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { ReplayBlock } from '../replay.js';
/** Builder for one provider stream's DSH chunks. */
export declare class BlockStream {
    private readonly open;
    private readonly finished;
    private nextIndex;
    /** Open one block if it is not open yet; returns the chunks to emit first. */
    private ensure;
    /** Append visible text. */
    text(key: string, delta: string): StreamChunk[];
    /** Append reasoning text. */
    reasoning(key: string, delta: string): StreamChunk[];
    /** Append a tool-call fragment. */
    toolDelta(key: string, delta: string, id?: string, name?: string): StreamChunk[];
    /** Attach native block metadata used by replay. */
    setMeta(key: string, meta: {
        signature?: string;
        id?: string;
    }): void;
    /** Close one open block and emit its assembled content. */
    close(key: string): StreamChunk[];
    /** Close every remaining block in start order. */
    closeAll(): StreamChunk[];
    /** Whether any block has been opened. */
    get hasBlocks(): boolean;
    /** Native metadata for every finished block, in emitted index order. */
    replayBlocks(): ReplayBlock[];
    /** Text accumulated by one block key. */
    textOf(key: string): string;
    /** Whether one block key is open. */
    isOpen(key: string): boolean;
    /** All open keys, in start order. */
    openKeys(): string[];
}
