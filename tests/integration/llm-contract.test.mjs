import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { catalogFixture, testConfig, testPreferences } from '../helpers.mjs'
import { NanoGptAdapter } from '../../lib/adapter.js'

const { snapshot, models } = catalogFixture()
const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
const gpt = models.find((model) => model.id === 'openai/gpt-5.5')

function makeHarness({ config = testConfig(), catalog = snapshot } = {}) {
  const ctx = new Context()
  const llm = new LlmRuntime(ctx)
  const adapter = new NanoGptAdapter({
    config: () => config,
    catalog: () => ({ current: () => catalog }),
    preferences: () => testPreferences({ defaultReasoningEffort: config.defaultReasoningEffort }),
    resolveApiKey: async () => 'test-key',
    logger: { info() {}, warn() {} },
    fetch: async () => {
      throw new Error('the contract test must not perform provider I/O')
    },
    attribution: () => ({}),
  })
  const registration = llm.registerAdapter(['nanogpt'], adapter)
  return { ctx, llm, adapter, registration }
}

test('the real LlmRuntime accepts our provider, models, and exact reasoning metadata', async () => {
  const h = makeHarness()
  try {
    assert.deepEqual(h.llm.listProviders(), [{ id: 'nanogpt', name: 'NanoGPT' }])
    const listed = await h.llm.listModels('nanogpt')
    assert.equal(listed.some((model) => model.id === deepseek.id), true)

    const info = await h.llm.resolveModelInfo('nanogpt', deepseek.id)
    assert.equal(info.provider, 'nanogpt')
    assert.equal(info.id, deepseek.id)
    assert.deepEqual(info.reasoning.efforts.map((effort) => String(effort.id)), ['none', 'off', 'low', 'high', 'max'])
    assert.equal(info.reasoning.defaultEffort, undefined)
    assert.equal(info.context.contextWindow, 1_048_576)

    // DSH rejects empty reasoning metadata; the adapter must never emit it.
    const unknownCatalog = {
      ...snapshot,
      models: [{ id: 'test/unknown-reasoning', name: 'Unknown reasoning', provider: 'test', aliases: [], reasoning: true, toolCalling: true, providers: [], serviceTiers: [], source: 'api' }],
    }
    const unknown = makeHarness({ catalog: unknownCatalog })
    try {
      const unknownInfo = await unknown.llm.resolveModelInfo('nanogpt', 'test/unknown-reasoning')
      assert.deepEqual(unknownInfo.reasoning.efforts.map((effort) => String(effort.id)), ['auto'])
      assert.equal(unknownInfo.reasoning.defaultEffort, undefined)
    } finally {
      unknown.registration()
    }
  } finally {
    h.registration()
  }
})

test('the real LlmRuntime validates and forwards only supported efforts', async () => {
  const h = makeHarness()
  try {
    const resolved = await h.llm.resolveCallConfig({
      provider: 'nanogpt',
      model: gpt.id,
      reasoningEffort: 'xhigh',
    })
    assert.equal(String(resolved.reasoningEffort), 'xhigh')
    const legacyOff = await h.llm.resolveCallConfig({ provider: 'nanogpt', model: deepseek.id, reasoningEffort: 'off' })
    assert.equal(String(legacyOff.reasoningEffort), 'off')

    await assert.rejects(
      () => h.llm.resolveCallConfig({ provider: 'nanogpt', model: deepseek.id, reasoningEffort: 'xhigh' }),
      (error) => error.code === 'UNSUPPORTED_REASONING_EFFORT',
    )

    const auto = await h.llm.resolveCallConfig({ provider: 'nanogpt', model: gpt.id, reasoningEffort: 'auto' }).then(
      () => 'accepted',
      (error) => error.code,
    )
    // gpt has no configured default, so Auto is DSH's omitted "provider
    // default" choice rather than an advertised explicit effort.
    assert.equal(auto, 'UNSUPPORTED_REASONING_EFFORT')
  } finally {
    h.registration()
  }
})

test('a configured default is materialized by DSH and accepted by the adapter metadata', async () => {
  const h = makeHarness({ config: testConfig({ defaultReasoningEffort: 'high' }) })
  try {
    const info = await h.llm.resolveModelInfo('nanogpt', deepseek.id)
    assert.deepEqual(info.reasoning.efforts.map((effort) => String(effort.id)), ['auto', 'none', 'off', 'low', 'high', 'max'])
    assert.equal(String(info.reasoning.defaultEffort), 'high')
    const resolved = await h.llm.resolveCallConfig({ provider: 'nanogpt', model: deepseek.id })
    assert.equal(String(resolved.reasoningEffort), 'high')
    const explicitAuto = await h.llm.resolveCallConfig({ provider: 'nanogpt', model: deepseek.id, reasoningEffort: 'auto' })
    assert.equal(String(explicitAuto.reasoningEffort), 'auto')
  } finally {
    h.registration()
  }
})

test('an advertised alias resolves under the requested id, as DSH requires', async () => {
  const canonical = { ...deepseek, id: 'test/canonical-model', aliases: ['test/alias-model'] }
  const aliasCatalog = { ...snapshot, models: [canonical] }
  const h = makeHarness({ catalog: aliasCatalog })
  try {
    const info = await h.llm.resolveModelInfo('nanogpt', 'test/alias-model')
    assert.equal(info.id, 'test/alias-model')
    assert.equal(info.name, deepseek.name)
    assert.deepEqual(info.reasoning.efforts.map((effort) => String(effort.id)), ['none', 'off', 'low', 'high', 'max'])
  } finally {
    h.registration()
  }
})

test('unregistering the adapter removes the route', async () => {
  const h = makeHarness()
  h.registration()
  assert.deepEqual(h.llm.listProviders(), [])
  await assert.rejects(
    () => h.llm.resolveModelInfo('nanogpt', deepseek.id),
    (error) => error.code === 'NO_ADAPTER',
  )
})
