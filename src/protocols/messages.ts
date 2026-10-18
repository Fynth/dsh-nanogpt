/**
 * Anthropic Messages request serialization.
 *
 * NanoGPT's `/v1/messages` accepts any catalog model through its compatibility
 * layer. Reasoning uses `output_config.effort` for enabled levels and
 * `thinking.type: disabled` for `none`; `output_config.effort: "none"` is not a
 * valid Messages value. Thinking signatures are replayed from the adapter's
 * replay envelope when present, which keeps Claude tool continuation working
 * without inventing signatures.
 *
 * @module dsh-nanogpt/protocols/messages
 */
import { LlmError, type RequestMessage } from '@deepseek-ai/dsh-llm'
import { protocolEndpoint } from '../config.js'
import { readReplay } from '../replay.js'
import {
  applyExtraBody,
  effectiveAdvanced,
  effectiveMaxTokens,
  effectiveProtocol,
  effectiveRouting,
  effectiveTemperature,
  effectiveTopP,
  imagePlaceholder,
  messagesTools,
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

/** One Anthropic content block. */
type MessagesBlock = Record<string, unknown>

/** Parse historical tool arguments into an object; malformed history degrades to `{}`. */
function historyInput(raw: string): Record<string, unknown> {
  const safe = safeHistoricalArguments(raw)
  try {
    const parsed: unknown = JSON.parse(safe)
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>
  } catch {
    // Fall through.
  }
  return {}
}

/** Convert one user block list into Anthropic content blocks. */
async function userBlocks(context: ProtocolContext, message: RequestMessage): Promise<MessagesBlock[]> {
  const blocks: MessagesBlock[] = []
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        if (block.text.length > 0) blocks.push({ type: 'text', text: block.text })
        break
      case 'image': {
        const image = await projectImage(context, block)
        if (image === undefined) blocks.push({ type: 'text', text: imagePlaceholder(block) })
        else {
          blocks.push({ type: 'text', text: image.handle })
          blocks.push({
            type: 'image',
            source: { type: 'base64', media_type: image.mediaType, data: image.data },
          })
        }
        break
      }
      case 'file':
        blocks.push({ type: 'text', text: projectFile(context, block.attachment) })
        break
      default:
        break
    }
  }
  return blocks
}

/** Convert one tool-result message into a user-role `tool_result` block. */
async function toolResultBlock(context: ProtocolContext, message: RequestMessage): Promise<MessagesBlock | undefined> {
  if (message.role !== 'tool') return undefined
  const content: MessagesBlock[] = []
  for (const block of message.content) {
    if (block.type === 'text' && block.text.length > 0) {
      content.push({ type: 'text', text: block.text })
    } else if (block.type === 'image') {
      const image = await projectImage(context, block)
      if (image === undefined) {
        content.push({ type: 'text', text: imagePlaceholder(block) })
      } else {
        content.push({ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } })
      }
    } else if (block.type === 'file') {
      content.push({ type: 'text', text: projectFile(context, block.attachment) })
    }
  }
  if (content.length === 0) content.push({ type: 'text', text: '(empty tool result)' })
  return {
    type: 'tool_result',
    tool_use_id: message.toolCallId,
    content,
    ...message.isError === true ? { is_error: true } : {},
  }
}

/** Convert one assistant message into Anthropic content blocks. */
function assistantBlocks(context: ProtocolContext, message: RequestMessage): MessagesBlock[] {
  if (message.role !== 'assistant') return []
  const replay = readReplay(message, 'messages', context.model.id)
  const blocks: MessagesBlock[] = []
  let blockIndex = 0
  for (const block of message.content) {
    switch (block.type) {
      case 'reasoning': {
        const signature = replay?.blocks[blockIndex]?.signature
        if (signature !== undefined && block.text.length > 0) {
          blocks.push({ type: 'thinking', thinking: block.text, signature })
        }
        blockIndex += 1
        break
      }
      case 'text':
        if (block.text.length > 0) blocks.push({ type: 'text', text: block.text })
        blockIndex += 1
        break
      case 'tool-call':
        blocks.push({
          type: 'tool_use',
          id: block.id,
          name: block.name,
          input: historyInput(block.arguments),
        })
        blockIndex += 1
        break
      default:
        break
    }
  }
  return blocks
}

/** Merge consecutive same-role messages, as Anthropic histories expect alternation. */
function mergeMessages(messages: { role: 'user' | 'assistant'; content: MessagesBlock[] }[]): {
  role: 'user' | 'assistant'
  content: MessagesBlock[]
}[] {
  const merged: { role: 'user' | 'assistant'; content: MessagesBlock[] }[] = []
  for (const message of messages) {
    const previous = merged[merged.length - 1]
    if (previous !== undefined && previous.role === message.role) {
      previous.content.push(...message.content)
    } else {
      merged.push({ role: message.role, content: [...message.content] })
    }
  }
  return merged
}

/**
 * Serialize one DSH request for `/messages`.
 * @param context - resolved model, reasoning, options, and request hooks.
 * @param baseHeaders - authentication/attribution headers.
 * @returns the exact wire request.
 */
export async function prepareMessagesRequest(
  context: ProtocolContext,
  baseHeaders: Record<string, string>,
): Promise<PreparedWireRequest> {
  const { config, model, options } = context
  const advanced = effectiveAdvanced(config, context.preferences, model)
  const protocol = effectiveProtocol(config, context.preferences, model)
  if (protocol !== 'messages') {
    throw new LlmError(`model "${model.id}" is configured for protocol "${protocol}", not messages`, 'INTERNAL')
  }
  const reasoning = reasoningFields(context, 'messages')
  const routing = routingApplication(effectiveRouting(config, context.preferences, model), model, config, 'messages')
  const search = webSearchModel(model.id, advanced)
  const projected = projectedMessages(options)
  const systemParts: string[] = []
  if (options.system !== undefined && options.system.trim().length > 0) systemParts.push(options.system)
  const messages: { role: 'user' | 'assistant'; content: MessagesBlock[] }[] = []
  for (const message of projected.messages) {
    if (message.role === 'system') {
      const text = textOfBlocks(message.content)
      if (text.length > 0) systemParts.push(text)
      continue
    }
    if (message.role === 'user') {
      const blocks = await userBlocks(context, message)
      if (blocks.length > 0) messages.push({ role: 'user', content: blocks })
      continue
    }
    if (message.role === 'assistant') {
      const blocks = assistantBlocks(context, message)
      if (blocks.length > 0) messages.push({ role: 'assistant', content: blocks })
      continue
    }
    if (message.role === 'tool') {
      const block = await toolResultBlock(context, message)
      if (block !== undefined) messages.push({ role: 'user', content: [block] })
    }
  }
  if (messages.length === 0) {
    throw new LlmError('NanoGPT Messages request has no serializable messages', 'INVALID_REQUEST')
  }
  const tools = model.toolCalling === false ? [] : projected.tools
  const warning = context.visibility === 'hide'
    ? 'NanoGPT Anthropic Messages does not document a reasoning-hide control; reasoning output remains visible on this transport.'
    : undefined
  const warnings = [...routing.warnings, ...search.warning === undefined ? [] : [search.warning], ...warning === undefined ? [] : [warning]]
  if (model.toolCalling === false && projected.tools.length > 0) {
    warnings.push(`Model "${model.id}" is not advertised as tool-capable; tool declarations were omitted.`)
  }
  const maxTokens =
    effectiveMaxTokens(options, config, advanced) ??
    model.maxOutputTokens ??
    4_096
  if (effectiveMaxTokens(options, config, advanced) === undefined && model.maxOutputTokens === undefined) {
    warnings.push('Anthropic Messages requires max_tokens; 4096 was used because the catalog discloses no output limit.')
  }
  const temperature = effectiveTemperature(options, config, advanced)
  const topP = effectiveTopP(config, advanced)
  const reasoningActive = context.policy !== undefined && reasoning.wireEffort !== 'none'
  if (reasoningActive && (temperature !== undefined || topP !== undefined)) {
    warnings.push(
      'Anthropic Messages adaptive/effort reasoning can reject temperature/top_p; the values were omitted for this request.',
    )
  }
  const suffixes = [
    ...routing.suffixes,
    ...search.suffix === undefined ? [] : [search.suffix],
  ]
  const modelId = modelWithSuffixes(search.model, suffixes)
  const promptCaching = advanced.promptCaching?.enabled === true
  const systemBlocks =
    systemParts.length === 0
      ? undefined
      : promptCaching
        ? [
            {
              type: 'text',
              text: systemParts.join('\n\n'),
              cache_control: { type: 'ephemeral', ...advanced.promptCaching?.ttl === '1h' ? { ttl: '1h' } : {} },
            },
          ]
        : systemParts.join('\n\n')
  const headers: Record<string, string> = { ...baseHeaders, 'Content-Type': 'application/json', ...routing.headers }
  if (promptCaching) {
    const beta = ['prompt-caching-2024-07-31']
    if (advanced.promptCaching?.ttl === '1h') beta.push('extended-cache-ttl-2025-04-11')
    headers['anthropic-beta'] = beta.join(',')
  }
  const body: Record<string, unknown> = {
    model: modelId,
    max_tokens: maxTokens,
    messages: mergeMessages(messages),
    stream: true,
    ...systemBlocks === undefined ? {} : { system: systemBlocks },
    ...reasoning.fields,
    ...routing.body,
    ...temperature === undefined || reasoningActive ? {} : { temperature },
    ...topP === undefined || reasoningActive ? {} : { top_p: topP },
    ...options.stop === undefined || options.stop.length === 0 ? {} : { stop_sequences: options.stop },
    ...messagesTools(tools) === undefined ? {} : { tools: messagesTools(tools) },
    ...options.sessionId === undefined ? {} : { metadata: { user_id: String(options.sessionId) } },
  }
  applyExtraBody(body, advanced)
  return {
    url: protocolEndpoint(config.baseURL, 'messages'),
    headers,
    body,
    protocol: 'messages',
    model: model.id,
    ...reasoning.wireEffort === undefined ? {} : { wireEffort: reasoning.wireEffort },
    excludeReasoning: false,
    maxTokens,
    ...routing.headers['X-Provider'] === undefined ? {} : { provider: routing.headers['X-Provider'] },
    warnings,
  }
}
