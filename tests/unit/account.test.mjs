import test from 'node:test'
import assert from 'node:assert/strict'
import { jsonResponse, mockFetch } from '../helpers.mjs'
import { readBalance, readSubscription, usageQuery } from '../../lib/usage.js'

function options(routes) {
  const mock = mockFetch(routes)
  return {
    mock,
    input: {
      origin: 'https://api.nano-gpt.com',
      baseURL: 'https://api.nano-gpt.com/api/v1',
      apiKey: 'test-key',
      attribution: { 'user-agent': 'test' },
      timeoutMs: 5_000,
      fetch: mock.fetch,
    },
  }
}

test('the usage read carries the documented date range and grouping', () => {
  const url = new URL(usageQuery('https://api.nano-gpt.com/api/v1', '2026-10-01', '2026-10-18'))
  assert.equal(url.pathname, '/api/v1/usage')
  assert.equal(url.searchParams.get('from'), '2026-10-01')
  assert.equal(url.searchParams.get('to'), '2026-10-18')
  assert.equal(url.searchParams.get('scope'), 'current_key')
  assert.equal(url.searchParams.get('group_by'), 'day,model')
})

test('documented snake_case string balances are read without inventing a unit', async () => {
  const { input, mock } = options([
    ['/api/check-balance', () => jsonResponse({ usd_balance: '12.34', nano_balance: '0.5', nanoDepositAddress: 'nano_abc' })],
  ])
  const result = await readBalance(input)
  assert.equal(result.failure, undefined)
  assert.equal(result.value.usd, 12.34)
  assert.equal(result.value.xno, 0.5)
  assert.equal(result.value.depositAddress, 'nano_abc')
  assert.equal(result.value.unknownUnit, false)
  assert.equal(mock.calls[0].url, 'https://api.nano-gpt.com/api/check-balance')
  assert.equal(mock.calls[0].init.headers.Authorization, 'Bearer test-key')
})

test('a generic balance without a unit is marked unknown rather than assumed USD', async () => {
  const { input } = options([['/api/check-balance', () => jsonResponse({ balance: '3' })]])
  const result = await readBalance(input)
  assert.equal(result.value.usd, undefined)
  assert.equal(result.value.xno, undefined)
  assert.equal(result.value.unknownUnit, true)
})

test('documented subscription quota windows are read from the top level and limits', async () => {
  const body = {
    active: true,
    state: 'active',
    dailyInputTokens: { used: 10, remaining: 90, percentUsed: 0.1, resetAt: 1800000000000, degraded: false },
    weeklyInputTokens: { used: 100, remaining: 600, percentUsed: 0.142, resetAt: 1800000000000 },
    dailyImages: { used: 2, remaining: 18, percentUsed: 0.1, resetAt: 1800000000000 },
    tokens: { used: 1000, remaining: 9000, percentUsed: 0.1, resetAt: 1800000000000 },
    limits: { dailyInputTokens: 100, weeklyInputTokens: 700, dailyImages: 20, tokens: 10000 },
    routing: { recommendedMode: 'subscription', reason: 'Quota available' },
    period: { currentPeriodEnd: '2026-11-01T00:00:00.000Z' },
  }
  const { input } = options([['/api/subscription/v1/usage', () => jsonResponse(body)]])
  const result = await readSubscription(input)
  assert.equal(result.failure, undefined)
  assert.equal(result.value.active, true)
  assert.equal(result.value.recommendedMode, 'subscription')
  assert.equal(result.value.periodEnd, '2026-11-01T00:00:00.000Z')
  const byId = Object.fromEntries(result.value.quotas.map((quota) => [quota.id, quota]))
  assert.deepEqual(Object.keys(byId).sort(), ['dailyImages', 'dailyInputTokens', 'tokens', 'weeklyInputTokens'])
  assert.equal(byId.dailyInputTokens.used, 10)
  assert.equal(byId.dailyInputTokens.remaining, 90)
  assert.equal(byId.dailyInputTokens.limit, 100)
  assert.equal(byId.weeklyInputTokens.limit, 700)
  assert.equal(byId.dailyImages.limit, 20)
  assert.equal(byId.tokens.limit, 10000)
})

test('legacy nested subscription limits still parse', async () => {
  const { input } = options([
    ['/api/subscription/v1/usage', () => jsonResponse({ limits: { daily: { used: 1, limit: 5 } } })],
  ])
  const result = await readSubscription(input)
  assert.equal(result.value.quotas[0].id, 'daily')
  assert.equal(result.value.quotas[0].limit, 5)
})

test('an invalid key is a classified balance failure, not a fabricated zero', async () => {
  const { input } = options([
    ['/api/check-balance', () => new Response(JSON.stringify({ error: { message: 'malformed_api_key', code: 'malformed_api_key' } }), { status: 401, headers: { 'Content-Type': 'application/json' } })],
  ])
  const result = await readBalance(input)
  assert.equal(result.value, undefined)
  assert.equal(result.failure.code, 'AUTH')
  assert.equal(result.failure.status, 401)
  assert.equal(JSON.stringify(result.failure).includes('test-key'), false)
})
