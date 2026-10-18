import test from 'node:test'
import assert from 'node:assert/strict'
import { fetchCatalog, fetchProviderCatalog } from '../../lib/discovery.js'
import { attributionHeaders } from '@deepseek-ai/dsh-llm'

const live = process.env.NANOGPT_LIVE === '1' ? test : test.skip
const BASE = 'https://api.nano-gpt.com/api/v1'
const DEPS = { attribution: attributionHeaders(), fetch: globalThis.fetch }

live('live detailed catalog is reachable and normalizes real models', async () => {
  const snapshot = await fetchCatalog({ baseURL: BASE, timeoutMs: 30_000 }, DEPS)
  assert.ok(snapshot.models.length > 100, `expected a large catalog, got ${snapshot.models.length}`)
  assert.equal(snapshot.endpoint, `${BASE}/models?detailed=true`)
  assert.equal(snapshot.version, 1)
  assert.ok(snapshot.hash.length === 64)
  const deepseek = snapshot.models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
  assert.ok(deepseek, 'the documented DeepSeek V4.1 Flash 1017 id must be present')
  assert.deepEqual(deepseek.reasoningEfforts, ['none', 'low', 'high', 'max'])
  assert.equal(deepseek.contextWindow, 1_048_576)
  assert.equal(deepseek.maxOutputTokens, 393_216)
  assert.deepEqual(deepseek.inputModalities, ['text', 'image'])
  assert.ok(deepseek.pricing && deepseek.pricing.input > 0)
  const opus = snapshot.models.find((model) => model.id === 'anthropic/claude-opus-5.5')
  assert.ok(opus)
  assert.deepEqual(opus.reasoningEfforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(snapshot.models.some((model) => model.id.includes('decisions')), false)
  console.log(`live catalog: ${snapshot.models.length} chat models from ${snapshot.endpoint}`)
})

live('live provider discovery exposes route-specific reasoning efforts', async () => {
  const outcome = await fetchProviderCatalog('https://api.nano-gpt.com', 'deepseek/deepseek-v4.1-flash-1017', DEPS, {
    timeoutMs: 30_000,
  })
  assert.equal(outcome.status, 'ok')
  assert.equal(outcome.catalog.supportsProviderSelection, true)
  assert.ok(outcome.catalog.providers.length > 0)
  const withEfforts = outcome.catalog.providers.filter((route) => route.reasoningEfforts !== undefined)
  assert.ok(withEfforts.length > 0)
  assert.ok(withEfforts.every((route) => Array.isArray(route.reasoningEfforts)))
  console.log(`live provider discovery: ${outcome.catalog.providers.length} routes, ${withEfforts.length} with effort metadata`)
})
