import test from 'node:test'
import assert from 'node:assert/strict'
import { mockFetch, streamResponse, testConfig, testPreferences } from '../helpers.mjs'
import { NanoGptAdapter } from '../../lib/adapter.js'
import { prepareChatRequest } from '../../lib/protocols/chat.js'
import { prepareResponsesRequest } from '../../lib/protocols/responses.js'
import { prepareMessagesRequest } from '../../lib/protocols/messages.js'
import { resolveReasoning, wireReasoning } from '../../lib/reasoning.js'
import { WIRE_EFFORTS } from '../../lib/shared.js'

/**
 * A synthetic catalog model that advertises every documented effort. It exists
 * only in tests: the live catalog decides which real model gets which ladder.
 */
const allEfforts = {
  id: 'test/all-efforts',
  name: 'All Efforts Test Model',
  provider: 'test',
  aliases: [],
  reasoning: true,
  reasoningEfforts: ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'],
  toolCalling: true,
  providers: [],
  serviceTiers: [],
  inputModalities: ['text'],
  source: 'api',
}

const snapshot = {
  version: 1,
  endpoint: 'https://api.nano-gpt.com/api/v1/models?detailed=true',
  fetchedAt: '2026-10-18T00:00:00.000Z',
  source: 'network',
  models: [allEfforts],
  rawCount: 1,
  hash: 'a'.repeat(64),
}

const DONE = [
  'data: {"choices":[{"index":0,"delta":{"content":"ok"},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
].join('\n')

function protocolContext(selection, protocol) {
  const policy = resolveReasoning({ model: allEfforts })
  return {
    config: testConfig({ protocol }),
    preferences: testPreferences(),
    model: allEfforts,
    policy,
    selection,
    visibility: 'show',
    options: {
      provider: 'nanogpt',
      model: allEfforts.id,
      ...selection === undefined ? {} : { reasoningEffort: selection },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    },
    resolveFileText: () => '',
    resolveImage: async () => undefined,
  }
}

test('every effort serializes exactly on every protocol and xhigh/max stay distinct', async () => {
  for (const effort of WIRE_EFFORTS) {
    const chat = await prepareChatRequest(protocolContext(effort, 'chat'), {})
    assert.equal(chat.body.reasoning_effort, effort, `chat ${effort}`)

    const responses = await prepareResponsesRequest(protocolContext(effort, 'responses'), {})
    if (effort === 'none') {
      assert.equal(responses.body.reasoning.effort, 'none', `responses ${effort}`)
    } else {
      assert.equal(responses.body.reasoning.effort, effort, `responses ${effort}`)
    }

    const messages = await prepareMessagesRequest(protocolContext(effort, 'messages'), {})
    if (effort === 'none') {
      assert.deepEqual(messages.body.thinking, { type: 'disabled' }, 'messages none disables thinking')
      assert.equal('output_config' in messages.body, false)
    } else {
      assert.equal(messages.body.output_config.effort, effort, `messages ${effort}`)
    }
    assert.equal(chat.wireEffort, effort)
  }
  const xhigh = await prepareChatRequest(protocolContext('xhigh', 'chat'), {})
  const max = await prepareChatRequest(protocolContext('max', 'chat'), {})
  assert.notEqual(xhigh.body.reasoning_effort, max.body.reasoning_effort)
  assert.equal(xhigh.body.reasoning_effort, 'xhigh')
  assert.equal(max.body.reasoning_effort, 'max')
})

test('auto and omitted preserve the provider default on every protocol', async () => {
  for (const selection of [undefined, 'auto']) {
    const chat = await prepareChatRequest(protocolContext(selection, 'chat'), {})
    assert.equal('reasoning_effort' in chat.body, false)
    assert.equal('reasoning' in chat.body, false)
    assert.equal(chat.wireEffort, undefined)

    const responses = await prepareResponsesRequest(protocolContext(selection, 'responses'), {})
    assert.equal('reasoning' in responses.body, false)

    const messages = await prepareMessagesRequest(protocolContext(selection, 'messages'), {})
    assert.equal('output_config' in messages.body, false)
    assert.equal('thinking' in messages.body, false)
  }
})

test('the adapter itself sends the selected effort in the real request body', async () => {
  const mock = mockFetch([['/chat/completions', () => streamResponse(DONE)]])
  const adapter = new NanoGptAdapter({
    config: () => testConfig({ protocol: 'chat' }),
    catalog: () => ({ current: () => snapshot }),
    preferences: () => testPreferences(),
    resolveApiKey: async () => 'test-key',
    logger: { info() {}, warn() {} },
    fetch: mock.fetch,
    attribution: () => ({}),
  })
  for (const effort of WIRE_EFFORTS) {
    for await (const chunk of adapter.stream({
      provider: 'nanogpt',
      model: allEfforts.id,
      reasoningEffort: effort,
      messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
    })) {
      assert.notEqual(chunk.type, 'error')
    }
    const body = JSON.parse(mock.calls.at(-1).init.body)
    assert.equal(body.reasoning_effort, effort, `adapter wire ${effort}`)
  }
  for await (const chunk of adapter.stream({
    provider: 'nanogpt',
    model: allEfforts.id,
    reasoningEffort: 'auto',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }] }],
  })) {
    assert.notEqual(chunk.type, 'error')
  }
  const autoBody = JSON.parse(mock.calls.at(-1).init.body)
  assert.equal('reasoning_effort' in autoBody, false)
  assert.equal('reasoning' in autoBody, false)
})

test('legacy off is only a validated alias for none', () => {
  const policy = resolveReasoning({ model: allEfforts })
  const wire = wireReasoning('chat', 'off', policy, 'show', allEfforts.id)
  assert.equal(wire.wireEffort, 'none')
  assert.equal(wire.fields.reasoning_effort, 'none')

  const alwaysThinking = resolveReasoning({
    model: { ...allEfforts, reasoningEfforts: ['low', 'high'], reasoning: true },
  })
  assert.throws(
    () => wireReasoning('chat', 'none', alwaysThinking, 'show', allEfforts.id),
    (error) => error.code === 'UNSUPPORTED_REASONING_EFFORT' && /cannot be disabled/.test(error.message),
  )
})

test('hiding reasoning output never changes the effort on any protocol', () => {
  const policy = resolveReasoning({ model: allEfforts })
  for (const protocol of ['chat', 'responses', 'messages']) {
    const wire = wireReasoning(protocol, 'xhigh', policy, 'hide', allEfforts.id)
    assert.equal(wire.wireEffort, 'xhigh')
    if (protocol === 'chat') {
      assert.equal(wire.exclude, true)
      assert.equal(wire.fields.reasoning_effort, 'xhigh')
      assert.deepEqual(wire.fields.reasoning, { exclude: true })
    } else if (protocol === 'responses') {
      assert.deepEqual(wire.fields.reasoning, { effort: 'xhigh', exclude: true })
    } else {
      assert.deepEqual(wire.fields.output_config, { effort: 'xhigh' })
      assert.equal('thinking' in wire.fields, false)
      assert.equal(wire.exclude, false)
    }
  }
})

test('unknown ladders expose only provider default unless experimental mode is explicit', () => {
  const unknown = { ...allEfforts, reasoningEfforts: undefined, reasoning: true, id: 'test/unknown' }
  const policy = resolveReasoning({ model: unknown })
  assert.ok(policy)
  assert.deepEqual(policy.efforts, [])
  assert.equal(policy.unknown, true)
  assert.equal(policy.source, 'unknown')
  const inferred = resolveReasoning({ model: unknown, experimental: true })
  assert.equal(inferred.source, 'inferred')
  assert.deepEqual(inferred.efforts, WIRE_EFFORTS)
  assert.equal(inferred.experimental, true)
})
