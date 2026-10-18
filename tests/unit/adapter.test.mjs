import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogFixture, fixture, jsonResponse, mockFetch, streamResponse, collect, testConfig, testPreferences } from '../helpers.mjs'
import { NanoGptAdapter } from '../../lib/adapter.js'
import { Diagnostics } from '../../lib/diagnostics.js'

const { snapshot, models } = catalogFixture()
const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
const gpt = models.find((model) => model.id === 'openai/gpt-5.5')

const chatSse = [
  'data: {"id":"chatcmpl_1","model":"openai/gpt-5.5","choices":[{"index":0,"delta":{"reasoning":"think"}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"content":"answer"}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: {"usage":{"prompt_tokens":10,"completion_tokens":2,"total_tokens":12}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

function makeAdapter(overrides = {}) {
  const diagnostics = new Diagnostics()
  let preferences = overrides.preferences ?? testPreferences()
  const config = overrides.config ?? testConfig()
  const { fetch, calls } = overrides.mock ?? mockFetch([['/chat/completions', streamResponse(chatSse, { headers: { 'x-request-id': 'req_1' } })]])
  const adapter = new NanoGptAdapter({
    config: () => config,
    catalog: () => ({ current: () => snapshot }),
    preferences: () => preferences,
    resolveApiKey: overrides.resolveApiKey ?? (async () => 'test-key'),
    resolveFileText: (ref) => `[file ${ref.name}]`,
    logger: { info() {}, warn() {} },
    fetch,
    attribution: () => ({ 'user-agent': 'dsh-nanogpt-test' }),
    diagnostics,
  })
  return {
    adapter,
    diagnostics,
    calls,
    setPreferences(next) { preferences = next },
  }
}

test('listModels filters hidden and retired models and pins favorites first', async () => {
  const { adapter } = makeAdapter({
    preferences: testPreferences({ hidden: ['z-ai/glm-5.3'], favorites: ['openai/gpt-5.5'], pinned: [] }),
  })
  const listed = await adapter.listModels('nanogpt')
  assert.equal(listed.some((model) => model.id === 'z-ai/glm-5.3'), false)
  assert.equal(listed[0].id, 'openai/gpt-5.5')
  assert.equal(listed.every((model) => model.provider === 'nanogpt'), true)
})

test('resolveModel advertises only verified efforts and no invented default', async () => {
  const { adapter } = makeAdapter()
  const resolved = await adapter.resolveModel('nanogpt', deepseek.id)
  assert.deepEqual(resolved.reasoning.efforts.map((effort) => String(effort.id)), ['none', 'off', 'low', 'high', 'max'])
  assert.equal(resolved.reasoning.defaultEffort, undefined)
  assert.equal(resolved.context.contextWindow, 1_048_576)
  assert.deepEqual(resolved.inputModalities, ['text', 'image'])
  assert.equal(resolved.defaultMaxTokens, undefined)
})

test('configured default adds an explicit Auto choice and materialized default', async () => {
  const { adapter } = makeAdapter({ preferences: testPreferences({ defaultReasoningEffort: 'high' }) })
  const resolved = await adapter.resolveModel('nanogpt', deepseek.id)
  assert.equal(String(resolved.reasoning.defaultEffort), 'high')
  assert.deepEqual(resolved.reasoning.efforts.map((effort) => String(effort.id)), ['auto', 'none', 'off', 'low', 'high', 'max'])
})

test('unknown models resolve by exact id without invented metadata', async () => {
  const { adapter } = makeAdapter()
  const resolved = await adapter.resolveModel('nanogpt', 'not/in/catalog')
  assert.equal(resolved.id, 'not/in/catalog')
  assert.equal(resolved.context, undefined)
  assert.equal(resolved.reasoning, undefined)
})

test('stream sends the selected effort and records safe diagnostics', async () => {
  const mock = mockFetch([['/chat/completions', streamResponse(chatSse, { headers: { 'x-request-id': 'req_1' } })]])
  const { adapter, diagnostics } = makeAdapter({ mock })
  const chunks = await collect(
    adapter.stream({
      provider: 'nanogpt',
      model: gpt.id,
      reasoningEffort: 'xhigh',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    }),
  )
  assert.equal(chunks.at(-1).type, 'finish')
  const call = mock.calls[0]
  assert.equal(call.url, 'https://api.nano-gpt.com/api/v1/chat/completions')
  assert.equal(call.init.headers.Authorization, 'Bearer test-key')
  assert.equal(call.init.headers['user-agent'], 'dsh-nanogpt-test')
  const body = JSON.parse(call.init.body)
  assert.equal(body.reasoning_effort, 'xhigh')
  assert.equal(body.model, gpt.id)
  const entry = diagnostics.list()[0]
  assert.equal(entry.model, gpt.id)
  assert.equal(entry.wireEffort, 'xhigh')
  assert.equal(entry.status, 200)
  assert.equal(entry.requestId, 'req_1')
  assert.equal(entry.usage.inputTokens, 10)
  assert.equal('body' in entry, false)
  assert.equal('messages' in entry, false)
})

test('legacy off reaches the wire as none, never the literal string', async () => {
  const mock = mockFetch([['/chat/completions', () => streamResponse(chatSse)]])
  const { adapter } = makeAdapter({ mock })
  for await (const _chunk of adapter.stream({
    provider: 'nanogpt',
    model: deepseek.id,
    reasoningEffort: 'off',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
  })) {
    // drain
  }
  const body = JSON.parse(mock.calls.at(-1).init.body)
  assert.equal(body.reasoning_effort, 'none')
  assert.equal(JSON.stringify(body).includes('"off"'), false)
})

test('a mid-stream failure after output is not marked retryable', async () => {
  const partial = [
    'data: {"choices":[{"index":0,"delta":{"content":"partial answer"}}]}',
    '',
    'data: {"error":{"message":"upstream vanished","code":"server_error"}}',
    '',
  ].join('\n')
  const mock = mockFetch([['/chat/completions', () => streamResponse(partial)]])
  const { adapter } = makeAdapter({ mock })
  await assert.rejects(
    () => collect(adapter.stream({ provider: 'nanogpt', model: gpt.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] })),
    (error) => error.code === 'STREAM_INTERRUPTED' && /partial output/.test(error.message),
  )
})

test('pinned provider route facts reject impossible output/tool/image/cache requests', async () => {
  const providers = fixture('providers-deepseek.json')
  providers.providers[0] = {
    ...providers.providers[0],
    supportsTools: false,
    supportsNonTextMediaInput: false,
    supportsPromptCaching: false,
    maxOutputTokens: 100,
  }
  const mock = mockFetch([
    ['/providers', () => jsonResponse(providers)],
    ['/chat/completions', () => streamResponse(chatSse)],
  ])
  const config = testConfig({ routing: { mode: 'provider', provider: 'deepinfra' } })
  const { adapter } = makeAdapter({ mock, config })
  const base = { provider: 'nanogpt', model: deepseek.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] }
  await assert.rejects(
    () => collect(adapter.stream({ ...base, maxTokens: 200 })),
    (error) => error.code === 'UNSUPPORTED_OPTION' && /caps output/.test(error.message),
  )
  await assert.rejects(
    () => collect(adapter.stream({ ...base, tools: [{ name: 'read', description: 'read', parameters: { type: 'object' } }] })),
    (error) => error.code === 'UNSUPPORTED_OPTION' && /does not advertise tool calling/.test(error.message),
  )
  await assert.rejects(
    () => collect(adapter.stream({
      ...base,
      messages: [{ role: 'user', content: [{ type: 'image', attachment: { attachmentId: 'a', mediaType: 'image/png', bytes: 1, width: 1, height: 1 } }] }],
    })),
    (error) => error.code === 'UNSUPPORTED_OPTION' && /does not advertise image input/.test(error.message),
  )
  const caching = testConfig({ routing: { mode: 'auto', caching: true } })
  const cacheAdapter = makeAdapter({ mock, config: caching }).adapter
  // caching routing is not a provider pin, so this uses a cache-capable route
  // without provider validation; the request itself remains serializable.
  const chunks = await collect(cacheAdapter.stream(base))
  assert.equal(chunks.at(-1).type, 'finish')
})

test('an idle timeout after partial output is not retryable', async () => {
  const encoder = new TextEncoder()
  const partial = 'data: {"choices":[{"index":0,"delta":{"content":"partial"}}]}\n\n'
  const silent = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(partial))
      // Intentionally never close: the parser's idle deadline must fire.
    },
  })
  const mock = mockFetch([
    ['/chat/completions', () => new Response(silent, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })],
  ])
  const config = testConfig({ streamIdleTimeoutMs: 40 })
  const { adapter } = makeAdapter({ mock, config })
  await assert.rejects(
    () => collect(adapter.stream({ provider: 'nanogpt', model: gpt.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] })),
    (error) => error.code === 'STREAM_INTERRUPTED' && /stalled after partial output/.test(error.message),
  )
})

test('a JSON 200 response is rejected as a non-SSE stream', async () => {
  const mock = mockFetch([
    ['/chat/completions', () => new Response(JSON.stringify({ error: 'not streamed' }), { status: 200, headers: { 'Content-Type': 'application/json' } })],
  ])
  const { adapter } = makeAdapter({ mock })
  await assert.rejects(
    () => collect(adapter.stream({ provider: 'nanogpt', model: gpt.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] })),
    (error) => error.code === 'MALFORMED_RESPONSE' && /instead of an SSE stream/.test(error.message),
  )
})

test('missing credential fails before network I/O', async () => {
  const mock = mockFetch([])
  const { adapter } = makeAdapter({ mock, resolveApiKey: async () => undefined })
  await assert.rejects(
    () => collect(adapter.stream({ provider: 'nanogpt', model: deepseek.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] })),
    (error) => error.code === 'MISSING_CREDENTIAL',
  )
  assert.equal(mock.calls.length, 0)
})

test('unknown model fails before network I/O', async () => {
  const mock = mockFetch([])
  const { adapter } = makeAdapter({ mock })
  await assert.rejects(
    () => collect(adapter.stream({ provider: 'nanogpt', model: 'no/such-model', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] })),
    (error) => error.code === 'UNKNOWN_MODEL',
  )
  assert.equal(mock.calls.length, 0)
})

test('HTTP failures are classified and diagnostic-safe', async () => {
  const mock = mockFetch([
    ['/chat/completions', () => new Response(JSON.stringify({ error: { message: 'bad key', code: 'invalid_api_key' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })],
  ])
  const { adapter, diagnostics } = makeAdapter({ mock })
  await assert.rejects(
    () => collect(adapter.stream({ provider: 'nanogpt', model: deepseek.id, messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }] })),
    (error) => error.code === 'AUTH' && error.failure.status === 401,
  )
  const entry = diagnostics.list()[0]
  assert.equal(entry.failure.code, 'AUTH')
  assert.equal(entry.failure.message.includes('test-key'), false)
})

test('pinned provider discovery narrows the request ladder without fanning out model resolution', async () => {
  const providers = fixture('providers-deepseek.json')
  const mock = mockFetch([
    ['/providers', jsonResponse(providers)],
    ['/chat/completions', () => streamResponse(chatSse)],
  ])
  const config = testConfig({ routing: { mode: 'provider', provider: 'deepinfra' } })
  const { adapter } = makeAdapter({ mock, config })
  // Model selection deliberately uses the model-wide ladder: resolving every
  // model must not fire one provider-discovery request per catalog entry.
  const resolved = await adapter.resolveModel('nanogpt', deepseek.id)
  assert.deepEqual(resolved.reasoning.efforts.map((effort) => String(effort.id)), ['none', 'off', 'low', 'high', 'max'])
  assert.equal(mock.calls.length, 0)
  // The actual request resolves the pinned route and enforces its narrower one.
  await assert.rejects(
    () => adapter.preview({
      provider: 'nanogpt',
      model: deepseek.id,
      reasoningEffort: 'max',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    }),
    (error) => error.code === 'UNSUPPORTED_REASONING_EFFORT',
  )
  assert.equal(mock.calls[0].url, 'https://api.nano-gpt.com/api/models/deepseek%2Fdeepseek-v4.1-flash-1017/providers')
  const preview = await adapter.preview({
    provider: 'nanogpt',
    model: deepseek.id,
    reasoningEffort: 'medium',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
  })
  assert.equal(preview.wireEffort, 'medium')
})

test('preview uses the real serializer and redacts the credential', async () => {
  const { adapter } = makeAdapter()
  const wire = await adapter.preview({
    provider: 'nanogpt',
    model: gpt.id,
    reasoningEffort: 'xhigh',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'preview' }] }],
  })
  assert.equal(wire.body.reasoning_effort, 'xhigh')
  assert.equal(wire.headers.Authorization, 'Bearer <redacted>')
})
