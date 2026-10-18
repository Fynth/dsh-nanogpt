import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogFixture, protocolContext, testConfig, testPreferences } from '../helpers.mjs'
import { prepareChatRequest } from '../../lib/protocols/chat.js'
import { prepareResponsesRequest } from '../../lib/protocols/responses.js'
import { prepareMessagesRequest } from '../../lib/protocols/messages.js'
import { resolveReasoning } from '../../lib/reasoning.js'
import { makeReplay } from '../../lib/replay.js'
import { LlmError, ToolCallId, MessageId } from '@deepseek-ai/dsh-llm'

const { models } = catalogFixture()
const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
const opus = models.find((model) => model.id === 'anthropic/claude-opus-5.5')
const gpt = models.find((model) => model.id === 'openai/gpt-5.5')

const tools = [
  {
    name: 'read_file',
    description: 'Read a file from the workspace.',
    parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
  },
]

function baseOptions(model, overrides = {}) {
  return {
    provider: 'nanogpt',
    model: model.id,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Inspect the project.' }] }],
    ...overrides,
  }
}

function ctx(model, { protocol = 'chat', selection, visibility = 'show', preferences = testPreferences(), config, options } = {}) {
  return protocolContext({
    model,
    config: config ?? testConfig({ protocol }),
    preferences,
    options: options ?? baseOptions(model, selection === undefined ? {} : { reasoningEffort: selection }),
    selection,
    visibility,
  })
}

test('chat preserves the exact model id and serializes reasoning effort', async () => {
  const request = await prepareChatRequest(ctx(gpt, { selection: 'xhigh' }), { Authorization: 'Bearer k' })
  assert.equal(request.body.model, 'openai/gpt-5.5')
  assert.equal(request.body.reasoning_effort, 'xhigh')
  assert.equal(request.body.stream, true)
  assert.deepEqual(request.body.stream_options, { include_usage: true })
  assert.equal(request.protocol, 'chat')
  assert.equal(request.wireEffort, 'xhigh')
})

test('chat omits the effort for auto/provider default', async () => {
  const request = await prepareChatRequest(ctx(gpt), { Authorization: 'Bearer k' })
  assert.equal('reasoning_effort' in request.body, false)
  assert.equal('reasoning' in request.body, false)
})

test('all supported effort values serialize exactly on each protocol', async () => {
  const cases = [
    { model: deepseek, values: ['none', 'low', 'high', 'max'] },
    { model: gpt, values: ['none', 'low', 'medium', 'high', 'xhigh'] },
    { model: opus, values: ['low', 'medium', 'high', 'xhigh', 'max'] },
  ]
  for (const { model, values } of cases) {
    for (const value of values) {
      const chat = await prepareChatRequest(ctx(model, { selection: value }), {})
      assert.equal(chat.body.reasoning_effort, value, `${model.id} chat ${value}`)
      const responses = await prepareResponsesRequest(ctx(model, { protocol: 'responses', selection: value }), {})
      assert.equal(responses.body.reasoning.effort, value, `${model.id} responses ${value}`)
      const messages = await prepareMessagesRequest(ctx(model, { protocol: 'messages', selection: value }), {})
      if (value === 'none') {
        assert.deepEqual(messages.body.thinking, { type: 'disabled' })
        assert.equal('output_config' in messages.body, false)
      } else {
        assert.equal(messages.body.output_config.effort, value, `${model.id} messages ${value}`)
      }
    }
  }
})

test('unsupported effort is refused before serialization', async () => {
  await assert.rejects(
    () => prepareChatRequest(ctx(deepseek, { selection: 'xhigh' }), {}),
    (error) => error instanceof Error && error.code === 'UNSUPPORTED_REASONING_EFFORT',
  )
})

test('chat converts tools, system, assistant tool calls, and tool results', async () => {
  const assistant = {
    role: 'assistant',
    id: MessageId('m1'),
    source: { kind: 'model', provider: 'nanogpt', model: deepseek.id },
    content: [
      { type: 'text', text: 'I will read it.' },
      { type: 'tool-call', id: ToolCallId('call_1'), name: 'read_file', arguments: '{"path":"a.ts"}' },
    ],
  }
  const toolResult = {
    role: 'tool',
    id: MessageId('m2'),
    source: { kind: 'tool', callId: ToolCallId('call_1') },
    toolCallId: ToolCallId('call_1'),
    content: [{ type: 'text', text: 'file contents' }],
  }
  const request = await prepareChatRequest(
    ctx(deepseek, {
      options: baseOptions(deepseek, {
        system: 'Be concise.',
        messages: [assistant, toolResult, { role: 'user', content: [{ type: 'text', text: 'Continue.' }] }],
        tools,
      }),
    }),
    {},
  )
  assert.equal(request.body.messages[0].role, 'system')
  assert.equal(request.body.messages[1].tool_calls[0].function.name, 'read_file')
  assert.equal(request.body.messages[2].tool_call_id, 'call_1')
  assert.equal(request.body.tools[0].type, 'function')
  assert.equal(request.body.tools[0].function.name, 'read_file')
})

test('historical malformed tool arguments degrade to an empty object', async () => {
  const assistant = {
    role: 'assistant',
    id: MessageId('m1'),
    source: { kind: 'model', provider: 'nanogpt', model: deepseek.id },
    content: [{ type: 'tool-call', id: ToolCallId('call_1'), name: 'read_file', arguments: '{broken' }],
  }
  const request = await prepareChatRequest(
    ctx(deepseek, { options: baseOptions(deepseek, { messages: [assistant] }) }),
    {},
  )
  assert.equal(request.body.messages[0].tool_calls[0].function.arguments, '{}')
})

test('tool-role images are preserved or replaced by a deterministic placeholder', async () => {
  const tool = {
    role: 'tool',
    id: MessageId('tool-image'),
    source: { kind: 'tool', callId: ToolCallId('call_img') },
    toolCallId: ToolCallId('call_img'),
    content: [{
      type: 'image',
      attachment: { attachmentId: 'img_1', mediaType: 'image/png', bytes: 10, width: 2, height: 3, name: 'shot.png' },
    }],
  }
  const chat = await prepareChatRequest(ctx(deepseek, { options: baseOptions(deepseek, { messages: [tool] }) }), {})
  const chatTool = chat.body.messages.find((message) => message.role === 'tool')
  assert.notEqual(chatTool.content, '(empty tool result)')
  assert.match(JSON.stringify(chatTool.content), /shot\.png|image/i)

  const responses = await prepareResponsesRequest(ctx(deepseek, { protocol: 'responses', options: baseOptions(deepseek, { messages: [tool] }) }), {})
  const output = responses.body.input.find((item) => item.type === 'function_call_output').output
  assert.notEqual(output, '(empty tool result)')
  assert.match(output, /shot\.png|image/i)

  const context = ctx(deepseek, { protocol: 'messages', options: baseOptions(deepseek, { messages: [tool] }) })
  context.resolveImage = async () => ({ mediaType: 'image/png', data: 'QUJD', handle: 'shot.png' })
  const messages = await prepareMessagesRequest(context, {})
  const result = messages.body.messages[0].content.find((block) => block.type === 'tool_result')
  assert.equal(result.content.some((block) => block.type === 'image'), true)
  assert.deepEqual(result.content.find((block) => block.type === 'image').source, {
    type: 'base64', media_type: 'image/png', data: 'QUJD',
  })
})

test('routing provider pins X-Provider and rejects cache conflicts', async () => {
  const config = testConfig({ protocol: 'chat', routing: { mode: 'provider', provider: 'deepinfra' } })
  const request = await prepareChatRequest(ctx(deepseek, { config }), {})
  assert.equal(request.header, undefined)
  assert.equal(request.headers['X-Provider'], 'deepinfra')
  const conflict = testConfig({ protocol: 'chat', routing: { mode: 'provider', provider: 'deepinfra', caching: true } })
  await assert.rejects(() => prepareChatRequest(ctx(deepseek, { config: conflict }), {}), (error) => error.code === 'UNSUPPORTED_OPTION')
})

test('routing goals use the documented body provider object', async () => {
  const config = testConfig({ protocol: 'chat', routing: { mode: 'price' } })
  const request = await prepareChatRequest(ctx(deepseek, { config }), {})
  assert.deepEqual(request.body.provider, { sort: 'price' })
})

test('service tiers are validated against the catalog', async () => {
  const supported = testConfig({ protocol: 'chat', routing: { mode: 'auto', serviceTier: 'flex' } })
  const gptRequest = await prepareChatRequest(ctx(gpt, { config: supported }), {})
  assert.equal(gptRequest.body.service_tier, 'flex')
  await assert.rejects(() => prepareChatRequest(ctx(deepseek, { config: supported }), {}), (error) => error.code === 'UNSUPPORTED_OPTION')
})

test('caching and billing controls use documented top-level fields', async () => {
  const config = testConfig({ protocol: 'chat', routing: { mode: 'auto', caching: true, stickyProvider: true, billingMode: 'paygo' } })
  const request = await prepareChatRequest(ctx(deepseek, { config }), {})
  assert.equal(request.body.caching, true)
  assert.equal(request.body.stickyProvider, true)
  assert.equal(request.body.billing_mode, 'paygo')
})

test('web search suffix and explicit prompt caching are serialized', async () => {
  const config = testConfig({
    protocol: 'chat',
    advanced: { webSearch: 'online/native', promptCaching: { enabled: true, ttl: '1h' } },
  })
  const request = await prepareChatRequest(ctx(deepseek, { config }), {})
  assert.equal(request.body.model, 'deepseek/deepseek-v4.1-flash-1017:online/native')
  assert.deepEqual(request.body.promptCaching, { enabled: true, ttl: '1h' })
  assert.ok(request.warnings.some((warning) => warning.includes('Web search suffix')))
})

test('extraBody cannot override reserved request fields', () => {
  assert.throws(
    () => testConfig({ advanced: { extraBody: { reasoning_effort: 'max' } } }),
    /reserved field "reasoning_effort"/,
  )
  const config = testConfig({ advanced: { extraBody: { custom_flag: 40 } } })
  assert.deepEqual(config.advanced.extraBody, { custom_flag: 40 })
})

test('reasoning visibility hide adds the exclude flag', async () => {
  const request = await prepareChatRequest(ctx(gpt, { selection: 'high', visibility: 'hide' }), {})
  assert.equal(request.body.reasoning_effort, 'high')
  assert.deepEqual(request.body.reasoning, { exclude: true })
  assert.equal(request.excludeReasoning, true)
})

test('responses serializes reasoning, tools, and store:false', async () => {
  const request = await prepareResponsesRequest(ctx(opus, { protocol: 'responses', selection: 'max' }), {})
  assert.deepEqual(request.body.reasoning, { effort: 'max' })
  assert.equal(request.body.store, false)
  assert.equal(request.body.stream, true)
  assert.deepEqual(request.body.include, ['reasoning.encrypted_content'])
  assert.equal(request.body.input[0].type, 'message')
})

test('responses uses documented routing suffixes, service tier, and sampling rules', async () => {
  const config = testConfig({ protocol: 'responses', routing: { mode: 'price', serviceTier: 'flex' } })
  const request = await prepareResponsesRequest(ctx(gpt, { protocol: 'responses', config, selection: 'high' }), {})
  assert.equal(request.body.model, 'openai/gpt-5.5:price')
  assert.equal('provider' in request.body, false)
  assert.equal('caching' in request.body, false)
  assert.equal(request.body.service_tier, 'flex')
  assert.equal(request.headers['X-Provider'], undefined)
  assert.equal('temperature' in request.body, false)
  assert.equal('top_p' in request.body, false)

  const nonReasoning = models.find((model) => model.id === 'moonshotai/kimi-k2.6')
  const sampling = await prepareResponsesRequest(
    ctx(nonReasoning, {
      protocol: 'responses',
      config: testConfig({ protocol: 'responses' }),
      options: baseOptions(nonReasoning, { temperature: 0.3, maxTokens: 128 }),
    }),
    {},
  )
  assert.equal(sampling.body.temperature, 0.3)
  assert.equal(sampling.body.max_output_tokens, 128)
})

test('responses hides reasoning with the documented body field, not a model suffix', async () => {
  const request = await prepareResponsesRequest(ctx(gpt, { protocol: 'responses', selection: 'high', visibility: 'hide' }), {})
  assert.equal(request.body.model, gpt.id)
  assert.deepEqual(request.body.reasoning, { effort: 'high', exclude: true })
})

test('messages uses routing suffixes, documented service tiers, and the hide suffix', async () => {
  const config = testConfig({ protocol: 'messages', routing: { mode: 'price', serviceTier: 'standard' } })
  const request = await prepareMessagesRequest(ctx(gpt, { protocol: 'messages', config, selection: 'high', visibility: 'hide' }), {})
  assert.equal(request.body.model, `${gpt.id}:price`)
  assert.equal(request.body.service_tier, 'standard')
  assert.ok(request.warnings.some((warning) => /reasoning-hide/.test(warning)))
  assert.equal(request.headers['X-Billing-Mode'], undefined)
  assert.equal('billing_mode' in request.body, false)
  const billed = await prepareMessagesRequest(
    ctx(gpt, { protocol: 'messages', config: testConfig({ protocol: 'messages', routing: { mode: 'auto', billingMode: 'paygo' } }) }),
    {},
  )
  assert.equal(billed.headers['X-Billing-Mode'], 'paygo')
})

test('cache-capable routing follows the per-transport combination rules', async () => {
  // Chat documents caching + a body sort (price ranking takes precedence).
  const chat = await prepareChatRequest(ctx(gpt, { config: testConfig({ protocol: 'chat', routing: { mode: 'price', caching: true } }) }), {})
  assert.deepEqual(chat.body.provider, { sort: 'price' })
  assert.equal(chat.body.caching, true)
  // Suffix transports reject the conflicting suffix combination.
  for (const protocol of ['responses', 'messages']) {
    const config = testConfig({ protocol, routing: { mode: 'speed', caching: true } })
    await assert.rejects(
      () => (protocol === 'responses' ? prepareResponsesRequest(ctx(gpt, { protocol, config }), {}) : prepareMessagesRequest(ctx(gpt, { protocol, config }), {})),
      (error) => error.code === 'UNSUPPORTED_OPTION' && /cache-capable/.test(error.message),
    )
  }
})

test('messages and responses reject service tiers their transport does not document', async () => {
  await assert.rejects(
    () => prepareResponsesRequest(ctx(gpt, { protocol: 'responses', config: testConfig({ protocol: 'responses', routing: { mode: 'auto', serviceTier: 'ultrafast' } }) }), {}),
    (error) => error.code === 'UNSUPPORTED_OPTION',
  )
  await assert.rejects(
    () => prepareChatRequest(ctx(gpt, { protocol: 'chat', config: testConfig({ protocol: 'chat', routing: { mode: 'auto', serviceTier: 'batch' } }) }), {}),
    (error) => error.code === 'UNSUPPORTED_OPTION',
  )
})

test('chat keeps its documented routing body object and billing field', async () => {
  const config = testConfig({ protocol: 'chat', routing: { mode: 'price', allowFallbacks: false, caching: false, billingMode: 'paygo' } })
  const request = await prepareChatRequest(ctx(gpt, { config }), {})
  assert.deepEqual(request.body.provider, { sort: 'price', allow_fallbacks: false })
  assert.equal(request.body.billing_mode, 'paygo')
  assert.equal(request.headers['X-Billing-Mode'], 'paygo')
})

test('responses rejects stop sequences and omits temperature on reasoning requests', async () => {
  await assert.rejects(
    () => prepareResponsesRequest(ctx(gpt, { protocol: 'responses', options: baseOptions(gpt, { reasoningEffort: 'high', stop: ['END'] }) }), {}),
    (error) => error.code === 'UNSUPPORTED_OPTION',
  )
  const request = await prepareResponsesRequest(
    ctx(gpt, { protocol: 'responses', selection: 'high', options: baseOptions(gpt, { reasoningEffort: 'high', temperature: 0.2 }) }),
    {},
  )
  assert.equal('temperature' in request.body, false)
})

test('messages requires max_tokens, maps stop_sequences, and disables thinking with none', async () => {
  const request = await prepareMessagesRequest(
    ctx(deepseek, { protocol: 'messages', selection: 'none', options: baseOptions(deepseek, { stop: ['END'] }) }),
    {},
  )
  assert.ok(Number.isInteger(request.body.max_tokens))
  assert.deepEqual(request.body.stop_sequences, ['END'])
  assert.deepEqual(request.body.thinking, { type: 'disabled' })
  assert.equal(request.body.model, 'deepseek/deepseek-v4.1-flash-1017')
})

test('messages replays thinking signatures from the adapter envelope', async () => {
  const replayState = makeReplay({
    protocol: 'messages',
    model: opus.id,
    blocks: [{ type: 'reasoning', signature: 'sig-123' }],
  })
  const assistant = {
    role: 'assistant',
    id: MessageId('m1'),
    source: { kind: 'model', provider: 'nanogpt', model: opus.id, replayState },
    content: [{ type: 'reasoning', text: 'thinking text' }, { type: 'text', text: 'answer' }],
  }
  const request = await prepareMessagesRequest(
    ctx(opus, { protocol: 'messages', options: baseOptions(opus, { messages: [assistant, { role: 'user', content: [{ type: 'text', text: 'continue' }] }] }) }),
    {},
  )
  const assistantMessage = request.body.messages.find((message) => message.role === 'assistant')
  assert.deepEqual(assistantMessage.content[0], { type: 'thinking', thinking: 'thinking text', signature: 'sig-123' })
})

test('messages routes explicit providers by header and caching by suffix', async () => {
  const routed = testConfig({ protocol: 'messages', routing: { mode: 'provider', provider: 'deepinfra' } })
  const request = await prepareMessagesRequest(ctx(deepseek, { protocol: 'messages', config: routed }), {})
  assert.equal(request.headers['X-Provider'], 'deepinfra')
  const caching = testConfig({ protocol: 'messages', routing: { mode: 'auto', caching: true } })
  const cached = await prepareMessagesRequest(ctx(deepseek, { protocol: 'messages', config: caching }), {})
  assert.equal(cached.body.model, 'deepseek/deepseek-v4.1-flash-1017:caching')
})

test('messages explicit prompt caching adds Claude beta headers and a cache marker', async () => {
  const config = testConfig({ protocol: 'messages', advanced: { promptCaching: { enabled: true, ttl: '1h' } } })
  const request = await prepareMessagesRequest(
    ctx(deepseek, { protocol: 'messages', config, options: baseOptions(deepseek, { system: 'Static instructions' }) }),
    {},
  )
  assert.match(request.headers['anthropic-beta'], /prompt-caching-2024-07-31/)
  assert.match(request.headers['anthropic-beta'], /extended-cache-ttl-2025-04-11/)
  assert.equal(Array.isArray(request.body.system), true)
  assert.deepEqual(request.body.system[0].cache_control, { type: 'ephemeral', ttl: '1h' })
})
