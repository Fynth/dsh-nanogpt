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
import { LlmError, ToolCallId, type StreamChunk } from '@deepseek-ai/dsh-llm'
import type { ReplayBlock } from '../replay.js'
import type { ContentBlockType } from '@deepseek-ai/dsh-llm'

/** One open block. */
interface OpenBlock {
  index: number
  type: ContentBlockType
  text: string
  args: string
  id: string
  name: string
  signature?: string
}

/** Builder for one provider stream's DSH chunks. */
export class BlockStream {
  private readonly open = new Map<string, OpenBlock>()
  private readonly finished: { index: number; meta: ReplayBlock }[] = []
  private nextIndex = 0

  /** Open one block if it is not open yet; returns the chunks to emit first. */
  private ensure(key: string, type: ContentBlockType): { block: OpenBlock; chunks: StreamChunk[] } {
    const existing = this.open.get(key)
    if (existing !== undefined) return { block: existing, chunks: [] }
    const block: OpenBlock = {
      index: this.nextIndex,
      type,
      text: '',
      args: '',
      id: '',
      name: '',
    }
    this.nextIndex += 1
    this.open.set(key, block)
    return { block, chunks: [{ type: 'block-start', index: block.index, blockType: type }] }
  }

  /** Append visible text. */
  text(key: string, delta: string): StreamChunk[] {
    if (delta.length === 0) return []
    const { block, chunks } = this.ensure(key, 'text')
    block.text += delta
    chunks.push({ type: 'text-delta', index: block.index, text: delta })
    return chunks
  }

  /** Append reasoning text. */
  reasoning(key: string, delta: string): StreamChunk[] {
    if (delta.length === 0) return []
    const { block, chunks } = this.ensure(key, 'reasoning')
    block.text += delta
    chunks.push({ type: 'reasoning-delta', index: block.index, text: delta })
    return chunks
  }

  /** Append a tool-call fragment. */
  toolDelta(key: string, delta: string, id?: string, name?: string): StreamChunk[] {
    const { block, chunks } = this.ensure(key, 'tool-call')
    if (id !== undefined && id.length > 0) block.id = id
    if (name !== undefined && name.length > 0) block.name = name
    block.args += delta
    chunks.push({
      type: 'tool-call-delta',
      index: block.index,
      id: ToolCallId(block.id.length > 0 ? block.id : `call_${block.index}`),
      ...name === undefined || name.length === 0 ? {} : { name },
      argumentsDelta: delta,
    })
    return chunks
  }

  /** Attach native block metadata used by replay. */
  setMeta(key: string, meta: { signature?: string; id?: string }): void {
    const block = this.open.get(key)
    if (block === undefined) return
    if (meta.signature !== undefined) block.signature = meta.signature
    if (meta.id !== undefined && block.id.length === 0) block.id = meta.id
  }

  /** Close one open block and emit its assembled content. */
  close(key: string): StreamChunk[] {
    const block = this.open.get(key)
    if (block === undefined) return []
    this.open.delete(key)
    if (block.type === 'tool-call') {
      const id = block.id.length > 0 ? block.id : `call_${block.index}`
      const args = block.args.trim().length === 0 ? '{}' : block.args
      let parsed: unknown
      try {
        parsed = JSON.parse(args)
      } catch {
        throw new LlmError(
          `NanoGPT streamed malformed JSON arguments for tool "${block.name || 'unknown'}"`,
          'MALFORMED_TOOL_ARGUMENTS',
        )
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new LlmError(
          `NanoGPT streamed non-object JSON arguments for tool "${block.name || 'unknown'}"`,
          'MALFORMED_TOOL_ARGUMENTS',
        )
      }
      this.finished.push({
        index: block.index,
        meta: { type: 'tool-call', ...block.signature === undefined ? {} : { signature: block.signature }, id },
      })
      return [
        {
          type: 'block-end',
          index: block.index,
          block: { type: 'tool-call', id: ToolCallId(id), name: block.name || 'tool', arguments: args },
        },
      ]
    }
    this.finished.push({
      index: block.index,
      meta: {
        type: block.type === 'reasoning' ? 'reasoning' : 'text',
        ...block.signature === undefined ? {} : { signature: block.signature },
      },
    })
    return [
      {
        type: 'block-end',
        index: block.index,
        block: block.type === 'reasoning' ? { type: 'reasoning', text: block.text } : { type: 'text', text: block.text },
      },
    ]
  }

  /** Close every remaining block in start order. */
  closeAll(): StreamChunk[] {
    const keys = [...this.open.keys()]
    keys.sort((a, b) => (this.open.get(a)?.index ?? 0) - (this.open.get(b)?.index ?? 0))
    const chunks: StreamChunk[] = []
    for (const key of keys) chunks.push(...this.close(key))
    return chunks
  }

  /** Whether any block has been opened. */
  get hasBlocks(): boolean {
    return this.nextIndex > 0
  }

  /** Native metadata for every finished block, in emitted index order. */
  replayBlocks(): ReplayBlock[] {
    return [...this.finished].sort((a, b) => a.index - b.index).map((entry) => entry.meta)
  }

  /** Text accumulated by one block key. */
  textOf(key: string): string {
    return this.open.get(key)?.text ?? ''
  }

  /** Whether one block key is open. */
  isOpen(key: string): boolean {
    return this.open.has(key)
  }

  /** All open keys, in start order. */
  openKeys(): string[] {
    return [...this.open.keys()].sort((a, b) => (this.open.get(a)?.index ?? 0) - (this.open.get(b)?.index ?? 0))
  }
}
