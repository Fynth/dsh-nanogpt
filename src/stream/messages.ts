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
import { LlmError, ProviderRequestId, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import { isRecord, optionalNumber, optionalString } from '../catalog.js'
import { failureCodeFor, parseProviderError } from '../errors.js'
import { makeReplay } from '../replay.js'
import { messagesTokenUsage } from '../usage.js'
import { BlockStream } from './blocks.js'
import { parseJsonEvent, parseSse } from '../sse.js'
import type { TranslationOptions } from './chat.js'

/** Classify one Anthropic-shaped stream error. */
function failureOf(payload: Record<string, unknown>, options: TranslationOptions): LlmError {
  const error = isRecord(payload.error) ? payload.error : payload
  const details = parseProviderError({ error }, 503)
  const status = optionalNumber(error.status) ?? 503
  return new LlmError(
    `NanoGPT Messages stream for "${options.model.id}" failed${details.code === undefined ? '' : ` (${details.code})`}: ${details.message}`,
    failureCodeFor(status, details),
    {
      status,
      ...options.requestId === undefined ? {} : { requestId: ProviderRequestId(options.requestId) },
    },
  )
}

/** Merge one usage snapshot over another without inventing absent counters. */
function mergeUsage(base: Record<string, unknown>, next: Record<string, unknown>): Record<string, unknown> {
  return { ...base, ...next }
}

/** Translate one Messages SSE body into DSH chunks. */
export async function* translateMessagesStream(
  body: ReadableStream<Uint8Array>,
  options: TranslationOptions,
): AsyncGenerator<StreamChunk> {
  const blocks = new BlockStream()
  let responseId: string | undefined
  let providerModel: string | undefined
  let stopReason: string | undefined
  let terminal = false
  let usageRaw: Record<string, unknown> = {}
  let usage: TokenUsage | undefined

  for await (const event of parseSse(body, {
    idleTimeoutMs: options.idleTimeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
  })) {
    const payload = parseJsonEvent(event, 'Messages')
    const type = optionalString(payload.type) ?? optionalString(event.event) ?? ''
    if (type === 'ping') continue
    if (type === 'error') throw failureOf(payload, options)
    if (type === 'message_start') {
      const message = isRecord(payload.message) ? payload.message : undefined
      responseId = optionalString(message?.id) ?? responseId
      providerModel = optionalString(message?.model) ?? providerModel
      if (isRecord(message?.usage)) usageRaw = mergeUsage(usageRaw, message.usage)
      continue
    }
    if (type === 'content_block_start') {
      const index = typeof payload.index === 'number' ? payload.index : 0
      const contentBlock = isRecord(payload.content_block) ? payload.content_block : undefined
      const blockType = optionalString(contentBlock?.type)
      const key = `block:${index}`
      if (blockType === 'text') {
        const initial = typeof contentBlock?.text === 'string' ? contentBlock.text : ''
        if (initial.length > 0) for (const chunk of blocks.text(key, initial)) yield chunk
      } else if (blockType === 'thinking') {
        const initial = typeof contentBlock?.thinking === 'string' ? contentBlock.thinking : ''
        if (initial.length > 0) for (const chunk of blocks.reasoning(key, initial)) yield chunk
        const signature = optionalString(contentBlock?.signature)
        if (signature !== undefined) blocks.setMeta(key, { signature })
      } else if (blockType === 'tool_use') {
        const id = optionalString(contentBlock?.id) ?? `call_${index}`
        const name = optionalString(contentBlock?.name) ?? 'tool'
        for (const chunk of blocks.toolDelta(key, '', id, name)) yield chunk
        if (isRecord(contentBlock?.input) && Object.keys(contentBlock.input).length > 0) {
          const initial = JSON.stringify(contentBlock.input)
          for (const chunk of blocks.toolDelta(key, initial)) yield chunk
        }
      }
      continue
    }
    if (type === 'content_block_delta') {
      const index = typeof payload.index === 'number' ? payload.index : 0
      const key = `block:${index}`
      const delta = isRecord(payload.delta) ? payload.delta : undefined
      const deltaType = optionalString(delta?.type)
      if (deltaType === 'text_delta' && typeof delta?.text === 'string') {
        for (const chunk of blocks.text(key, delta.text)) yield chunk
      } else if (deltaType === 'thinking_delta' && typeof delta?.thinking === 'string') {
        for (const chunk of blocks.reasoning(key, delta.thinking)) yield chunk
      } else if (deltaType === 'signature_delta' && typeof delta?.signature === 'string') {
        blocks.setMeta(key, { signature: delta.signature })
      } else if (deltaType === 'input_json_delta' && typeof delta?.partial_json === 'string') {
        for (const chunk of blocks.toolDelta(key, delta.partial_json)) yield chunk
      }
      continue
    }
    if (type === 'content_block_stop') {
      const index = typeof payload.index === 'number' ? payload.index : 0
      for (const chunk of blocks.close(`block:${index}`)) yield chunk
      continue
    }
    if (type === 'message_delta') {
      const delta = isRecord(payload.delta) ? payload.delta : undefined
      stopReason = optionalString(delta?.stop_reason) ?? stopReason
      if (isRecord(payload.usage)) usageRaw = mergeUsage(usageRaw, payload.usage)
      continue
    }
    if (type === 'message_stop') {
      terminal = true
      continue
    }
  }

  if (!terminal) {
    throw new LlmError(
      `NanoGPT Messages stream for "${options.model.id}" ended without message_stop`,
      'STREAM_CLOSED',
    )
  }
  for (const chunk of blocks.closeAll()) yield chunk
  if (!blocks.hasBlocks) {
    throw new LlmError(`NanoGPT returned an empty response for "${options.model.id}"`, 'EMPTY_RESPONSE')
  }
  usage = messagesTokenUsage(usageRaw)
  const hasToolCalls = blocks.replayBlocks().some((block) => block.type === 'tool-call')
  const reason =
    stopReason === 'max_tokens'
      ? ('max-tokens' as const)
      : hasToolCalls || stopReason === 'tool_use'
        ? ('tool-calls' as const)
        : ('stop' as const)
  if (options.metrics !== undefined && usage !== undefined) options.metrics.usage = usage
  if (usage !== undefined) yield { type: 'usage', usage }
  yield {
    type: 'finish',
    reason: { kind: reason },
    replayState: makeReplay({
      protocol: 'messages',
      model: options.model.id,
      ...responseId === undefined ? {} : { responseId },
      ...providerModel === undefined ? {} : { providerModel },
      ...stopReason === undefined ? {} : { nativeStopReason: stopReason },
      blocks: blocks.replayBlocks(),
    }),
  }
}
