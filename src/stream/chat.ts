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
import { LlmError, ProviderRequestId, type StreamChunk, type TokenUsage } from '@deepseek-ai/dsh-llm'
import { isRecord, optionalNumber, optionalString } from '../catalog.js'
import { failureCodeFor, parseProviderError, reportedCost } from '../errors.js'
import { makeReplay } from '../replay.js'
import { chatTokenUsage } from '../usage.js'
import type { CatalogModel } from '../shared.js'
import { BlockStream } from './blocks.js'
import { isDoneEvent, parseJsonEvent, parseSse, type SseEvent } from '../sse.js'

/** Options for one provider-stream translation. */
export interface TranslationOptions {
  /** Exact model being streamed. */
  model: CatalogModel
  /** Caller cancellation. */
  signal?: AbortSignal
  /** Maximum idle time between bytes. */
  idleTimeoutMs: number
  /** Provider request id from response headers. */
  requestId?: string
  /** Mutable metrics sink the adapter reads after the stream settles. */
  metrics?: { usage?: TokenUsage; costUsd?: number }
}

/** Extract a string content delta, tolerating array content. */
function contentDelta(value: unknown): string {
  if (typeof value === 'string') return value
  if (!Array.isArray(value)) return ''
  let text = ''
  for (const part of value) {
    if (isRecord(part) && part.type === 'text' && typeof part.text === 'string') text += part.text
  }
  return text
}

/** Build a classified mid-stream failure without echoing provider payload text. */
export function streamFailure(payload: Record<string, unknown>, fallbackStatus: number, options: TranslationOptions): LlmError {
  const details = parseProviderError(payload, optionalNumber(payload.status) ?? fallbackStatus)
  const status = optionalNumber(payload.status) ?? fallbackStatus
  return new LlmError(
    `NanoGPT stream for "${options.model.id}" failed${details.code === undefined ? '' : ` (${details.code})`}: ${details.message}`,
    failureCodeFor(status, details),
    {
      status,
      ...options.requestId === undefined ? {} : { requestId: ProviderRequestId(options.requestId) },
    },
  )
}

/** Translate one Chat Completions SSE body into DSH chunks. */
export async function* translateChatStream(
  body: ReadableStream<Uint8Array>,
  options: TranslationOptions,
): AsyncGenerator<StreamChunk> {
  const blocks = new BlockStream()
  let responseId: string | undefined
  let providerModel: string | undefined
  let finishReason: string | undefined
  let terminal = false
  let usage: TokenUsage | undefined
  let cost: number | undefined
  let sawAny = false

  for await (const event of parseSse(body, {
    idleTimeoutMs: options.idleTimeoutMs,
    ...options.signal === undefined ? {} : { signal: options.signal },
  })) {
    if (isDoneEvent(event)) {
      terminal = true
      break
    }
    const payload = parseJsonEvent(event, 'Chat Completions')
    sawAny = true
    const error = payload.error
    if (error !== undefined) {
      throw streamFailure(payload, 503, options)
    }
    responseId = optionalString(payload.id) ?? responseId
    providerModel = optionalString(payload.model) ?? providerModel
    const choices = Array.isArray(payload.choices) ? payload.choices.filter(isRecord) : []
    const choice = choices.find((entry) => entry.index === 0) ?? choices[0]
    if (choice !== undefined) {
      const delta = isRecord(choice.delta) ? choice.delta : undefined
      if (delta !== undefined) {
        const reasoning = typeof delta.reasoning === 'string' ? delta.reasoning : typeof delta.reasoning_content === 'string' ? delta.reasoning_content : ''
        if (reasoning.length > 0) {
          for (const chunk of blocks.reasoning('reasoning', reasoning)) yield chunk
        }
        const text = contentDelta(delta.content)
        if (text.length > 0) {
          for (const chunk of blocks.text('text', text)) yield chunk
        }
        const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls.filter(isRecord) : []
        for (let index = 0; index < toolCalls.length; index += 1) {
          const call = toolCalls[index]
          if (call === undefined) continue
          const callIndex = typeof call.index === 'number' ? call.index : index
          const fn = isRecord(call.function) ? call.function : undefined
          const id = optionalString(call.id)
          const name = optionalString(fn?.name)
          const args = typeof fn?.arguments === 'string' ? fn.arguments : ''
          for (const chunk of blocks.toolDelta(`tool:${callIndex}`, args, id, name)) yield chunk
        }
      }
      finishReason = optionalString(choice.finish_reason) ?? finishReason
      if (choice.finish_reason === 'error') {
        throw streamFailure(payload, 503, options)
      }
    }
    if (isRecord(payload.usage)) usage = chatTokenUsage(payload.usage) ?? usage
    const reported = reportedCost(payload)
    if (reported !== undefined) cost = reported
  }

  if (!terminal && finishReason === undefined) {
    throw new LlmError(
      `NanoGPT Chat Completions stream for "${options.model.id}" ended without a terminal marker`,
      'STREAM_CLOSED',
    )
  }
  if (!sawAny && !blocks.hasBlocks) {
    throw new LlmError(`NanoGPT returned an empty response for "${options.model.id}"`, 'EMPTY_RESPONSE')
  }
  for (const chunk of blocks.closeAll()) yield chunk
  if (!blocks.hasBlocks) {
    throw new LlmError(`NanoGPT returned an empty response for "${options.model.id}"`, 'EMPTY_RESPONSE')
  }
  const hasToolCalls = blocks.replayBlocks().some((block) => block.type === 'tool-call')
  const reason =
    hasToolCalls && (finishReason === undefined || finishReason === 'stop' || finishReason === 'tool_calls')
      ? ('tool-calls' as const)
      : finishReason === 'length'
        ? ('max-tokens' as const)
        : ('stop' as const)
  if (options.metrics !== undefined) {
    if (usage !== undefined) options.metrics.usage = usage
    if (cost !== undefined) options.metrics.costUsd = cost
  }
  if (usage !== undefined) yield { type: 'usage', usage }
  yield {
    type: 'finish',
    reason: { kind: reason },
    replayState: makeReplay({
      protocol: 'chat',
      model: options.model.id,
      ...responseId === undefined ? {} : { responseId },
      ...providerModel === undefined ? {} : { providerModel },
      ...finishReason === undefined ? {} : { nativeStopReason: finishReason },
      blocks: blocks.replayBlocks(),
    }),
  }
}
