import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { catalogFixture, collect, fixture, jsonResponse, mockFetch, streamResponse, testConfig } from '../helpers.mjs'
import { NanoGptAdapter } from '../../lib/adapter.js'
import { Diagnostics } from '../../lib/diagnostics.js'
import { PreferencesStore } from '../../lib/preferences.js'
import { createNanoGptRpcHandler, RPC_ENDPOINTS } from '../../lib/rpc.js'

const { snapshot, models } = catalogFixture()
const gpt = models.find((model) => model.id === 'openai/gpt-5.5')
const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')

const chatSse = [
  'data: {"id":"c1","model":"openai/gpt-5.5","choices":[{"index":0,"delta":{"content":"hi"}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}',
  '',
  'data: [DONE]',
  '',
].join('\n')

async function harness({ balanceStatus = 200, config = testConfig(), agentDefaultModel } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-nanogpt-rpc-'))
  const store = new PreferencesStore({ path: join(dir, 'preferences.json') })
  await store.load()
  const diagnostics = new Diagnostics()
  const stored = { value: 'test-key' }
  const credentialCalls = []
  const credentials = {
    describe: async () => ({ configured: stored.value !== undefined, writable: true, source: 'store' }),
    set: async (ref, value) => { credentialCalls.push(['set', String(ref), value]); stored.value = value },
    unset: async (ref) => { credentialCalls.push(['unset', String(ref)]); stored.value = undefined },
  }
  const mock = mockFetch([
    ['/chat/completions', streamResponse(chatSse)],
    ['/providers', jsonResponse(fixture('providers-deepseek.json'))],
    ['/api/check-balance', () => balanceStatus === 200
      ? jsonResponse({ usdBalance: 1.23 })
      : new Response(JSON.stringify({ error: { message: 'Incorrect API key', code: 'invalid_api_key' } }), { status: balanceStatus, headers: { 'Content-Type': 'application/json' } })],
    ['/api/subscription/v1/usage', jsonResponse({ active: true, state: 'active', routing: { recommendedMode: 'subscription', reason: 'Quota available' }, limits: { dailyInputTokens: { used: 10, remaining: 90, limit: 100, percentUsed: 0.1, resetAt: 1800000000000 } } })],
    ['/usage', jsonResponse({ from: '2026-10-01', to: '2026-10-18', totals: { requests: 2, netCostUsd: 0.01, inputTokens: 10, outputTokens: 5, totalTokens: 15 } })],
    ['/models', jsonResponse(fixture('models-detailed.json'))],
  ])
  const adapter = new NanoGptAdapter({
    config: () => config,
    catalog: () => ({ current: () => snapshot }),
    preferences: () => store.current(),
    resolveApiKey: async () => stored.value,
    logger: { info() {}, warn() {} },
    fetch: mock.fetch,
    attribution: () => ({ 'user-agent': 'test' }),
    diagnostics,
  })
  const catalog = {
    current: () => snapshot,
    status: () => ({ status: 'ready', source: 'api', fetchedAt: snapshot.fetchedAt, stale: false, chatModels: snapshot.models.length, rawModels: snapshot.rawCount, refreshing: false }),
    refresh: async () => ({ refreshed: true, changed: false, models: snapshot.models.length, cacheWritten: true }),
  }
  const handler = createNanoGptRpcHandler({
    config: () => config,
    catalog: () => catalog,
    preferences: () => store.current(),
    store,
    adapter,
    resolveCredential: async () => stored.value,
    credentials: () => credentials,
    discovery: { fetch: mock.fetch, attribution: { 'user-agent': 'test' } },
    logger: { warn() {} },
    ...agentDefaultModel === undefined ? {} : { agentDefaultModel: () => agentDefaultModel },
  })
  return {
    handler,
    store,
    adapter,
    mock,
    stored,
    credentialCalls,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  }
}

test('status reports connected state without any credential value', async () => {
  const h = await harness()
  try {
    const reply = await h.handler(RPC_ENDPOINTS.status, {}, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.provider, 'nanogpt')
    assert.equal(reply.value.credential.reference, 'NANOGPT_API_KEY')
    assert.equal(reply.value.credential.configured, true)
    assert.equal(reply.value.counts.total, 6)
    assert.equal(JSON.stringify(reply.value).includes('test-key'), false)
    assert.equal(reply.value.catalog.chatModels, 6)
  } finally {
    await h.cleanup()
  }
})

test('default model selection is written through the DSH service and reported honestly', async () => {
  const saved = []
  let current = { provider: 'nanogpt', model: deepseek.id, reasoningEffort: 'high' }
  const service = {
    currentSelection: () => current,
    async saveSelection(next) { saved.push(next); current = { ...next } },
  }
  const h = await harness({ agentDefaultModel: service })
  try {
    const status = await h.handler(RPC_ENDPOINTS.status, {}, new AbortController().signal)
    assert.equal(status.value.agentDefault.model, deepseek.id)
    const reply = await h.handler(RPC_ENDPOINTS.defaultSet, { model: gpt.id, reasoningEffort: 'xhigh' }, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.persisted, true)
    assert.deepEqual(saved[0], { provider: 'nanogpt', model: gpt.id, reasoningEffort: 'xhigh' })
    const unsupported = await h.handler(RPC_ENDPOINTS.defaultSet, { model: deepseek.id, reasoningEffort: 'xhigh' }, new AbortController().signal)
    assert.equal(unsupported.ok, false)
    assert.equal(unsupported.error.code, 'UNSUPPORTED_REASONING_EFFORT')
  } finally {
    await h.cleanup()
  }
})

test('models query searches, filters, sorts, and paginates', async () => {
  const h = await harness()
  try {
    const all = await h.handler(RPC_ENDPOINTS.modelsQuery, { limit: 2, offset: 0, sort: 'name' }, new AbortController().signal)
    assert.equal(all.ok, true)
    assert.equal(all.value.total, 6)
    assert.equal(all.value.items.length, 2)
    assert.ok(all.value.items.some((item) => item.reasoning !== undefined))
    const reasoning = await h.handler(RPC_ENDPOINTS.modelsQuery, { reasoning: true }, new AbortController().signal)
    assert.equal(reasoning.value.total, 4)
    const tools = await h.handler(RPC_ENDPOINTS.modelsQuery, { tools: true }, new AbortController().signal)
    assert.equal(tools.value.total, 5)
    const vision = await h.handler(RPC_ENDPOINTS.modelsQuery, { vision: true }, new AbortController().signal)
    assert.equal(vision.value.total, 4)
    const price = await h.handler(RPC_ENDPOINTS.modelsQuery, { sort: 'input-price' }, new AbortController().signal)
    assert.equal(price.value.items[0].id, 'deepseek/deepseek-v4.1-flash-1017')
    const search = await h.handler(RPC_ENDPOINTS.modelsQuery, { query: 'glm' }, new AbortController().signal)
    assert.equal(search.value.total, 1)
  } finally {
    await h.cleanup()
  }
})

test('hidden models are listed only with showHidden', async () => {
  const h = await harness()
  try {
    await h.store.update({ hidden: ['z-ai/glm-5.3'] })
    const hidden = await h.handler(RPC_ENDPOINTS.modelsQuery, {}, new AbortController().signal)
    assert.equal(hidden.value.total, 5)
    const shown = await h.handler(RPC_ENDPOINTS.modelsQuery, { showHidden: true }, new AbortController().signal)
    assert.equal(shown.value.total, 6)
    const item = shown.value.items.find((entry) => entry.id === 'z-ai/glm-5.3')
    assert.equal(item.hidden, true)
  } finally {
    await h.cleanup()
  }
})

test('preferences update uses revisions and refuses stale writes', async () => {
  const h = await harness()
  try {
    const first = await h.handler(RPC_ENDPOINTS.preferencesUpdate, { revision: 1, patch: { favorites: ['openai/gpt-5.5'] } }, new AbortController().signal)
    assert.equal(first.ok, true)
    assert.equal(first.value.revision, 2)
    const stale = await h.handler(RPC_ENDPOINTS.preferencesUpdate, { revision: 1, patch: { favorites: [] } }, new AbortController().signal)
    assert.equal(stale.ok, false)
    assert.equal(stale.error.code, 'STALE_REVISION')
  } finally {
    await h.cleanup()
  }
})

test('credential set stores through the credentials seam and never echoes the key', async () => {
  const h = await harness()
  try {
    const reply = await h.handler(RPC_ENDPOINTS.credentialSet, { value: 'new-secret-key' }, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(JSON.stringify(reply).includes('new-secret-key'), false)
    assert.deepEqual(h.credentialCalls[0], ['set', 'NANOGPT_API_KEY', 'new-secret-key'])
    assert.equal(reply.value.configured, true)
    const removed = await h.handler(RPC_ENDPOINTS.credentialRemove, {}, new AbortController().signal)
    assert.equal(removed.ok, true)
    assert.equal(removed.value.configured, false)
  } finally {
    await h.cleanup()
  }
})

test('connection test proves authentication through an authenticated endpoint', async () => {
  const h = await harness()
  try {
    const reply = await h.handler(RPC_ENDPOINTS.connectionTest, {}, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.status, 'connected')
    assert.equal(reply.value.authenticated, true)
    assert.equal(reply.value.balanceUsd, 1.23)
    assert.equal(reply.value.catalogReachable, true)
    assert.equal(JSON.stringify(reply).includes('test-key'), false)
  } finally {
    await h.cleanup()
  }
})

test('connection test reports an invalid key without treating the catalog as proof', async () => {
  const h = await harness({ balanceStatus: 401 })
  try {
    const reply = await h.handler(RPC_ENDPOINTS.connectionTest, {}, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.status, 'invalid-key')
    assert.equal(reply.value.authenticated, false)
  } finally {
    await h.cleanup()
  }
})

test('usage read returns balance, aggregate usage, and subscription values', async () => {
  const h = await harness()
  try {
    const reply = await h.handler(RPC_ENDPOINTS.usageRead, {}, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.balance.value.usd, 1.23)
    assert.equal(reply.value.usage.value.netCostUsd, 0.01)
    assert.equal(reply.value.subscription.value.active, true)
    assert.equal(reply.value.subscription.value.quotas[0].id, 'dailyInputTokens')
  } finally {
    await h.cleanup()
  }
})

test('request preview reflects the real serializer and redacts secrets', async () => {
  const h = await harness()
  try {
    const reply = await h.handler(
      RPC_ENDPOINTS.requestPreview,
      { model: 'openai/gpt-5.5', reasoningEffort: 'xhigh', maxTokens: 64 },
      new AbortController().signal,
    )
    assert.equal(reply.ok, true)
    assert.equal(reply.value.endpoint, 'https://api.nano-gpt.com/api/v1/chat/completions')
    assert.equal(reply.value.body.reasoning_effort, 'xhigh')
    assert.equal(reply.value.body.max_tokens, 64)
    assert.equal(reply.value.headers.Authorization, 'Bearer <redacted by host>')
    assert.equal(JSON.stringify(reply).includes('test-key'), false)
    assert.equal(reply.value.body.messages[0].content.includes('Preview request'), true)
  } finally {
    await h.cleanup()
  }
})

test('provider discovery is exposed to the settings page', async () => {
  const h = await harness()
  try {
    const reply = await h.handler(RPC_ENDPOINTS.modelsProviders, { id: 'deepseek/deepseek-v4.1-flash-1017' }, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.status, 'ok')
    assert.equal(reply.value.catalog.providers.length, 3)
    assert.deepEqual(reply.value.catalog.providers[0].reasoningEfforts, ['none', 'low', 'medium', 'high'])
  } finally {
    await h.cleanup()
  }
})

test('diagnostics list contains settled request facts only', async () => {
  const h = await harness()
  try {
    await collect(h.adapter.stream({
      provider: 'nanogpt',
      model: gpt.id,
      reasoningEffort: 'high',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
    }))
    const reply = await h.handler(RPC_ENDPOINTS.diagnosticsList, {}, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.entries.length, 1)
    assert.equal(reply.value.entries[0].wireEffort, 'high')
    assert.equal(JSON.stringify(reply.value).includes('hello'), false)
  } finally {
    await h.cleanup()
  }
})

test('unknown endpoints fail explicitly', async () => {
  const h = await harness()
  try {
    const reply = await h.handler('no/such', {}, new AbortController().signal)
    assert.equal(reply.ok, false)
    assert.equal(reply.error.code, 'unknown-endpoint')
  } finally {
    await h.cleanup()
  }
})
