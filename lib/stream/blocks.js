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
import { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm';
/** Builder for one provider stream's DSH chunks. */
export class BlockStream {
    open = new Map();
    finished = [];
    nextIndex = 0;
    /** Open one block if it is not open yet; returns the chunks to emit first. */
    ensure(key, type) {
        const existing = this.open.get(key);
        if (existing !== undefined)
            return { block: existing, chunks: [] };
        const block = {
            index: this.nextIndex,
            type,
            text: '',
            args: '',
            id: '',
            name: '',
        };
        this.nextIndex += 1;
        this.open.set(key, block);
        return { block, chunks: [{ type: 'block-start', index: block.index, blockType: type }] };
    }
    /** Append visible text. */
    text(key, delta) {
        if (delta.length === 0)
            return [];
        const { block, chunks } = this.ensure(key, 'text');
        block.text += delta;
        chunks.push({ type: 'text-delta', index: block.index, text: delta });
        return chunks;
    }
    /** Append reasoning text. */
    reasoning(key, delta) {
        if (delta.length === 0)
            return [];
        const { block, chunks } = this.ensure(key, 'reasoning');
        block.text += delta;
        chunks.push({ type: 'reasoning-delta', index: block.index, text: delta });
        return chunks;
    }
    /** Append a tool-call fragment. */
    toolDelta(key, delta, id, name) {
        const { block, chunks } = this.ensure(key, 'tool-call');
        if (id !== undefined && id.length > 0)
            block.id = id;
        if (name !== undefined && name.length > 0)
            block.name = name;
        block.args += delta;
        chunks.push({
            type: 'tool-call-delta',
            index: block.index,
            id: ToolCallId(block.id.length > 0 ? block.id : `call_${block.index}`),
            ...name === undefined || name.length === 0 ? {} : { name },
            argumentsDelta: delta,
        });
        return chunks;
    }
    /** Attach native block metadata used by replay. */
    setMeta(key, meta) {
        const block = this.open.get(key);
        if (block === undefined)
            return;
        if (meta.signature !== undefined)
            block.signature = meta.signature;
        if (meta.id !== undefined && block.id.length === 0)
            block.id = meta.id;
    }
    /** Close one open block and emit its assembled content. */
    close(key) {
        const block = this.open.get(key);
        if (block === undefined)
            return [];
        this.open.delete(key);
        if (block.type === 'tool-call') {
            const id = block.id.length > 0 ? block.id : `call_${block.index}`;
            const args = block.args.trim().length === 0 ? '{}' : block.args;
            let parsed;
            try {
                parsed = JSON.parse(args);
            }
            catch {
                throw new LlmError(`NanoGPT streamed malformed JSON arguments for tool "${block.name || 'unknown'}"`, 'MALFORMED_TOOL_ARGUMENTS');
            }
            if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
                throw new LlmError(`NanoGPT streamed non-object JSON arguments for tool "${block.name || 'unknown'}"`, 'MALFORMED_TOOL_ARGUMENTS');
            }
            this.finished.push({
                index: block.index,
                meta: { type: 'tool-call', ...block.signature === undefined ? {} : { signature: block.signature }, id },
            });
            return [
                {
                    type: 'block-end',
                    index: block.index,
                    block: { type: 'tool-call', id: ToolCallId(id), name: block.name || 'tool', arguments: args },
                },
            ];
        }
        this.finished.push({
            index: block.index,
            meta: {
                type: block.type === 'reasoning' ? 'reasoning' : 'text',
                ...block.signature === undefined ? {} : { signature: block.signature },
            },
        });
        return [
            {
                type: 'block-end',
                index: block.index,
                block: block.type === 'reasoning' ? { type: 'reasoning', text: block.text } : { type: 'text', text: block.text },
            },
        ];
    }
    /** Close every remaining block in start order. */
    closeAll() {
        const keys = [...this.open.keys()];
        keys.sort((a, b) => (this.open.get(a)?.index ?? 0) - (this.open.get(b)?.index ?? 0));
        const chunks = [];
        for (const key of keys)
            chunks.push(...this.close(key));
        return chunks;
    }
    /** Whether any block has been opened. */
    get hasBlocks() {
        return this.nextIndex > 0;
    }
    /** Native metadata for every finished block, in emitted index order. */
    replayBlocks() {
        return [...this.finished].sort((a, b) => a.index - b.index).map((entry) => entry.meta);
    }
    /** Text accumulated by one block key. */
    textOf(key) {
        return this.open.get(key)?.text ?? '';
    }
    /** Whether one block key is open. */
    isOpen(key) {
        return this.open.has(key);
    }
    /** All open keys, in start order. */
    openKeys() {
        return [...this.open.keys()].sort((a, b) => (this.open.get(a)?.index ?? 0) - (this.open.get(b)?.index ?? 0));
    }
}
