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
import type { Message, ReplayEnvelope } from '@deepseek-ai/dsh-llm'
import { isRecord, optionalString } from './catalog.js'
import type { Protocol } from './shared.js'

/** One block's native metadata, aligned with emitted block order. */
export interface ReplayBlock {
  type: 'text' | 'reasoning' | 'tool-call'
  /** Anthropic thinking signature. */
  signature?: string
  /** Provider block/call id, when disclosed. */
  id?: string
}

/** Versioned envelope this adapter writes. */
export interface NanoReplay {
  v: 1
  protocol: Protocol
  /** Requested model id. */
  model: string
  /** Provider-returned response id. */
  responseId?: string
  /** Provider-native stop reason. */
  nativeStopReason?: string
  /** Response model id, when it differs from the request. */
  providerModel?: string
  /** Per-block metadata in emitted order. */
  blocks: ReplayBlock[]
  /** Complete Responses output items for stateless replay. */
  outputItems?: unknown[]
}

/** Build one replay envelope. */
export function makeReplay(input: Omit<NanoReplay, 'v'>): ReplayEnvelope {
  return { response: { v: 1, ...input } satisfies NanoReplay }
}

/** Read the envelope from one durable assistant message. */
export function readReplay(message: Message, protocol: Protocol, model: string): NanoReplay | undefined {
  if (message.role !== 'assistant') return undefined
  const raw = message.source.replayState
  if (raw === undefined) return undefined
  const response = isRecord(raw) && isRecord(raw.response) ? raw.response : undefined
  if (response === undefined || response.v !== 1) return undefined
  if (response.protocol !== protocol) return undefined
  const storedModel = optionalString(response.model)
  if (storedModel !== model) return undefined
  const blocks: ReplayBlock[] = []
  if (Array.isArray(response.blocks)) {
    for (const block of response.blocks) {
      if (!isRecord(block)) continue
      const type = block.type
      if (type !== 'text' && type !== 'reasoning' && type !== 'tool-call') continue
      blocks.push({
        type,
        ...optionalString(block.signature) === undefined ? {} : { signature: optionalString(block.signature) },
        ...optionalString(block.id) === undefined ? {} : { id: optionalString(block.id) },
      })
    }
  }
  const outputItems = Array.isArray(response.outputItems) ? response.outputItems : undefined
  return {
    v: 1,
    protocol,
    model,
    ...optionalString(response.responseId) === undefined ? {} : { responseId: optionalString(response.responseId) },
    ...optionalString(response.nativeStopReason) === undefined
      ? {}
      : { nativeStopReason: optionalString(response.nativeStopReason) },
    ...optionalString(response.providerModel) === undefined
      ? {}
      : { providerModel: optionalString(response.providerModel) },
    blocks,
    ...outputItems === undefined ? {} : { outputItems },
  }
}

/** Read one block's native metadata by emitted block index. */
export function replayBlock(replay: NanoReplay | undefined, index: number): ReplayBlock | undefined {
  return replay?.blocks[index]
}
