/**
 * OpenAI Chat Completions request serialization.
 *
 * This is the default NanoGPT transport: it accepts every chat model in the
 * catalog uniformly, streams `reasoning` and `reasoning_content` deltas, and
 * carries tool calls in the standard `tool_calls` shape. Reasoning effort uses
 * the documented top-level `reasoning_effort` field; `reasoning.exclude`
 * controls visibility only.
 *
 * @module dsh-nanogpt/protocols/chat
 */
import { LlmError, type RequestMessage } from '@deepseek-ai/dsh-llm'
import { protocolEndpoint } from '../config.js'
import {
  applyExtraBody,
  chatTools,
  effectiveAdvanced,
  effectiveMaxTokens,
  effectiveProtocol,
  effectiveRouting,
  effectiveTemperature,
  effectiveTopP,
  imagePlaceholder,
  modelWithSuffixes,
  projectFile,
  projectImage,
  projectedMessages,
  reasoningFields,
  routingApplication,
  safeHistoricalArguments,
  textOfBlocks,
  webSearchModel,
  type PreparedWireRequest,
  type ProtocolContext,
} from './common.js'

/** One Chat Completions content part. */
type ChatPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/** Convert a content-block list into Chat Completions content. */
async function contentForMessage(
  context: ProtocolContext,
  message: RequestMessage,
): Promise<string | ChatPart[] | undefined> {
  const parts: ChatPart[] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) parts.push({ type: 'text', text: block.text })
        break
      case 'image': {
        const image = await projectImage(context, block)
        if (image === undefined) {
          parts.push({ type: 'text', text: imagePlaceholder(block) })
        } else {
          parts.push({ type: 'text', text: image.handle })
          parts.push({ type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } })
        }
        break
      }
      case 'file':
        parts.push({ type: 'text', text: projectFile(context, block.attachment) })
        break
      default:
        // Reasoning, tool calls, and tool-update blocks never become user text.
        break
    }
  }
  if (parts.length === 0) return undefined
  if (parts.some((part) => part.type === 'image_url')) return parts
  return parts.map((part) => part.type === 'text' ? part.text : '').join('')
}

/** Convert one durable assistant message into Chat Completions shape. */
function assistantMessage(message: RequestMessage): Record<string, unknown> | undefined {
  if (message.role !== 'assistant') return undefined
  const text = textOfBlocks(message.content)
  const toolCalls = message.content.flatMap((block) =>
    block.type === 'tool-call'
      ? [{
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: safeHistoricalArguments(block.arguments),
          },
        }]
      : [],
  )
  if (text.length === 0 && toolCalls.length === 0) return undefined
  return {
    role: 'assistant',
    content: text.length === 0 ? null : text,
    ...toolCalls.length === 0 ? {} : { tool_calls: toolCalls },
  }
}

/** Convert one tool-result message, preserving image/file blocks. */
async function toolMessage(context: ProtocolContext, message: RequestMessage): Promise<Record<string, unknown> | undefined> {
  if (message.role !== 'tool') return undefined
  const content = await contentForMessage(context, message)
  return {
    role: 'tool',
    tool_call_id: message.toolCallId,
    content: content === undefined ? '(empty tool result)' : content,
  }
}

/**
 * Serialize one DSH request for `/chat/completions`.
 * @param context - resolved model, reasoning, options, and request hooks.
 * @param baseHeaders - authentication/attribution headers.
 * @returns the exact wire request.
 */
export async function prepareChatRequest(
  context: ProtocolContext,
  baseHeaders: Record<string, string>,
): Promise<PreparedWireRequest> {
  const { config, model, options } = context
  const advanced = effectiveAdvanced(config, context.preferences, model)
  const routing = effectiveRouting(config, context.preferences, model)
  const protocol = effectiveProtocol(config, context.preferences, model)
  if (protocol !== 'chat') {
    throw new LlmError(`model "${model.id}" is configured for protocol "${protocol}", not chat`, 'INTERNAL')
  }
  const reasoning = reasoningFields(context, 'chat')
  const routed = routingApplication(routing, model, config, 'chat')
  const search = webSearchModel(model.id, advanced)
  const wireModel = modelWithSuffixes(
    search.model,
    [
      ...routed.suffixes,
      ...search.suffix === undefined ? [] : [search.suffix],
    ],
  )
  const projected = projectedMessages(options)
  const messages: Record<string, unknown>[] = []
  if (options.system !== undefined && options.system.trim().length > 0) {
    messages.push({ role: 'system', content: options.system })
  }
  for (const message of projected.messages) {
    if (message.role === 'system') {
      const text = textOfBlocks(message.content)
      if (text.length > 0) messages.push({ role: 'system', content: text })
      continue
    }
    if (message.role === 'user') {
      const content = await contentForMessage(context, message)
      if (content !== undefined) messages.push({ role: 'user', content })
      continue
    }
    if (message.role === 'assistant') {
      const assistant = assistantMessage(message)
      if (assistant !== undefined) messages.push(assistant)
      continue
    }
    if (message.role === 'tool') {
      const tool = await toolMessage(context, message)
      if (tool !== undefined) messages.push(tool)
      continue
    }
    // Developer messages were already removed by the tool-update projection.
  }
  if (messages.length === 0) {
    throw new LlmError('NanoGPT request has no serializable messages', 'INVALID_REQUEST')
  }
  const tools = model.toolCalling === false ? [] : projected.tools
  const warnings = [...routed.warnings, ...search.warning === undefined ? [] : [search.warning]]
  if (model.toolCalling === false && projected.tools.length > 0) {
    warnings.push(`Model "${model.id}" is not advertised as tool-capable; tool declarations were omitted.`)
  }
  const maxTokens = effectiveMaxTokens(options, config, advanced)
  const temperature = effectiveTemperature(options, config, advanced)
  const topP = effectiveTopP(config, advanced)
  const body: Record<string, unknown> = {
    model: wireModel,
    messages,
    stream: true,
    stream_options: { include_usage: true },
    ...reasoning.fields,
    ...routed.body,
    ...maxTokens === undefined ? {} : { max_tokens: maxTokens },
    ...temperature === undefined ? {} : { temperature },
    ...topP === undefined ? {} : { top_p: topP },
    ...options.stop === undefined || options.stop.length === 0 ? {} : { stop: options.stop },
    ...advanced.seed === undefined ? {} : { seed: advanced.seed },
    ...advanced.presencePenalty === undefined ? {} : { presence_penalty: advanced.presencePenalty },
    ...advanced.frequencyPenalty === undefined ? {} : { frequency_penalty: advanced.frequencyPenalty },
    ...chatTools(tools) === undefined ? {} : { tools: chatTools(tools) },
    ...advanced.promptCaching?.enabled === true
      ? { promptCaching: { enabled: true, ...advanced.promptCaching.ttl === undefined ? {} : { ttl: advanced.promptCaching.ttl } } }
      : {},
  }
  applyExtraBody(body, advanced)
  return {
    url: protocolEndpoint(config.baseURL, 'chat'),
    headers: { ...baseHeaders, 'Content-Type': 'application/json', ...routed.headers },
    body,
    protocol: 'chat',
    model: model.id,
    ...reasoning.wireEffort === undefined ? {} : { wireEffort: reasoning.wireEffort },
    excludeReasoning: reasoning.exclude,
    ...maxTokens === undefined ? {} : { maxTokens },
    ...routed.provider === undefined ? {} : { provider: routed.provider },
    warnings,
  }
}
