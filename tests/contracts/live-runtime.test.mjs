import test from 'node:test'
import assert from 'node:assert/strict'
import { Context } from '@deepseek-ai/cordis'
import { LlmRuntime } from '@deepseek-ai/dsh-llm'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'
import { fetchCatalog } from '../../lib/discovery.js'
import { NanoGptAdapter } from '../../lib/adapter.js'
import { testConfig, testPreferences } from '../helpers.mjs'

const live = process.env.NANOGPT_LIVE === '1' ? test : test.skip
const BASE = 'https://api.nano-gpt.com/api/v1'

live('the live catalog resolves through the real DSH LlmRuntime without failures', async () => {
  const snapshot = await fetchCatalog(
    { baseURL: BASE, timeoutMs: 30_000 },
    { attribution: attributionHeaders(), fetch: globalThis.fetch },
  )
  assert.ok(snapshot.models.length > 100)
  const ctx = new Context()
  const llm = new LlmRuntime(ctx)
  const adapter = new NanoGptAdapter({
    config: () => testConfig(),
    catalog: () => ({ current: () => snapshot }),
    preferences: () => testPreferences(),
    resolveApiKey: async () => undefined,
    logger: { info() {}, warn() {} },
    fetch: async () => {
      throw new Error('the live runtime-contract test must not perform provider I/O')
    },
    attribution: () => attributionHeaders(),
  })
  const registration = llm.registerAdapter(['nanogpt'], adapter)
  try {
    const listed = await llm.listModels('nanogpt')
    assert.equal(listed.length, snapshot.models.length)
    let failures = 0
    let autoOnly = 0
    for (const model of snapshot.models) {
      try {
        const info = await llm.resolveModelInfo('nanogpt', model.id)
        assert.equal(info.id, model.id)
        if (info.reasoning !== undefined) {
          assert.ok(info.reasoning.efforts.length > 0, `${model.id} returned empty efforts`)
          if (info.reasoning.efforts.length === 1 && String(info.reasoning.efforts[0].id) === 'auto') autoOnly += 1
        }
      } catch (error) {
        failures += 1
        if (failures <= 5) console.error(`resolve failed for ${model.id}: ${error.message}`)
      }
    }
    assert.equal(failures, 0)
    const deepseek = snapshot.models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
    assert.ok(deepseek)
    const agnes = snapshot.models.find((model) => model.id === 'agnes-3.0-flash')
    if (agnes !== undefined) {
      const info = await llm.resolveModelInfo('nanogpt', agnes.id)
      assert.deepEqual(info.reasoning.efforts.map((effort) => String(effort.id)), ['auto'])
      assert.equal(info.reasoning.defaultEffort, undefined)
    }
    const resolved = await llm.resolveCallConfig({ provider: 'nanogpt', model: deepseek.id, reasoningEffort: 'high' })
    assert.equal(String(resolved.reasoningEffort), 'high')
    await assert.rejects(
      () => llm.resolveCallConfig({ provider: 'nanogpt', model: deepseek.id, reasoningEffort: 'xhigh' }),
      (error) => error.code === 'UNSUPPORTED_REASONING_EFFORT',
    )
    console.log(`live runtime contract: ${listed.length} models resolved, 0 failures, ${autoOnly} Auto-only reasoning models`)
  } finally {
    registration()
  }
})
