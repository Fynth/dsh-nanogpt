import test from 'node:test'
import assert from 'node:assert/strict'
import { chatTokenUsage, messagesTokenUsage, responsesTokenUsage } from '../../lib/usage.js'
import {
  failureCodeFor,
  httpFailure,
  parseProviderError,
  parseRetryAfter,
  parseRetryAfter as retryAfter,
  redactSecrets,
} from '../../lib/errors.js'

test('provider error envelopes are decoded across shapes', () => {
  assert.deepEqual(parseProviderError({ error: { message: 'bad key', code: 'invalid_api_key', type: 'authentication_error' } }, 401), {
    message: 'bad key',
    code: 'invalid_api_key',
    type: 'authentication_error',
  })
  assert.equal(parseProviderError({ error: 'Insufficient balance', status: 402 }, 402).message, 'Insufficient balance')
  assert.equal(parseProviderError(undefined, 500).message, 'HTTP 500')
})

test('HTTP statuses map to stable provider-neutral codes', () => {
  assert.equal(failureCodeFor(401, { message: 'x' }), 'AUTH')
  assert.equal(failureCodeFor(403, { message: 'x' }), 'AUTH')
  assert.equal(failureCodeFor(402, { message: 'x' }), 'QUOTA')
  assert.equal(failureCodeFor(429, { message: 'x' }), 'RATE_LIMIT')
  assert.equal(failureCodeFor(503, { message: 'x' }), 'SERVER')
  assert.equal(failureCodeFor(400, { message: 'x', code: 'context_length_exceeded' }), 'CONTEXT_WINDOW_EXCEEDED')
  assert.equal(failureCodeFor(400, { message: 'x', code: 'reasoning_required' }), 'UNSUPPORTED_REASONING_EFFORT')
  assert.equal(failureCodeFor(400, { message: 'daily request limit exceeded', code: 'daily_rpd_limit_exceeded' }), 'RATE_LIMIT')
  assert.equal(failureCodeFor(400, { message: 'Insufficient balance' }), 'QUOTA')
  assert.equal(failureCodeFor(418, { message: 'teapot' }), 'HTTP_418')
})

test('provider-controlled text is redacted and bounded before logging', () => {
  const echoed = parseProviderError({ error: { message: 'bad header Authorization: Bearer sk-abcdefghijklmnop api_key=supersecret', code: 'invalid' } }, 401)
  assert.equal(echoed.message.includes('sk-abcdefghijklmnop'), false)
  assert.equal(echoed.message.includes('supersecret'), false)
  assert.match(echoed.message, /Bearer <redacted>/)
  assert.equal(redactSecrets('x'.repeat(10_000)).length <= 2_001, true)
  const failure = httpFailure(401, { error: { message: 'Bearer sk-abcdefghijklmnop leaked' } }, new Headers(), 'model/x')
  assert.equal(failure.message.includes('sk-abcdefghijklmnop'), false)
})

test('httpFailure retains status, Retry-After, and request id but never a body', () => {
  const headers = new Headers({ 'retry-after': '7', 'x-request-id': 'req_abc' })
  const error = httpFailure(429, { error: { message: 'slow down', code: 'rate_limit_exceeded' } }, headers, 'model/x')
  assert.equal(error.code, 'RATE_LIMIT')
  assert.equal(error.failure.status, 429)
  assert.equal(error.failure.providerRetryAfterMs, 7_000)
  assert.equal(String(error.failure.requestId), 'req_abc')
  assert.ok(error.message.includes('model/x'))
  assert.equal(error.message.includes('rate_limit_exceeded'), true)
  assert.equal(error.message.includes('slow down'), true)
})

test('Retry-After accepts seconds and HTTP dates', () => {
  assert.equal(parseRetryAfter('3'), 3_000)
  assert.equal(parseRetryAfter('not-a-date'), undefined)
  const now = Date.parse('2026-10-18T00:00:00.000Z')
  assert.equal(retryAfter('Sun, 18 Oct 2026 00:00:30 GMT', now), 30_000)
})

test('chat usage keeps counters disjoint and does not double-count cached input', () => {
  const usage = chatTokenUsage({
    prompt_tokens: 100,
    completion_tokens: 20,
    total_tokens: 120,
    prompt_tokens_details: { cached_tokens: 40 },
    completion_tokens_details: { reasoning_tokens: 7 },
  })
  assert.deepEqual(usage, {
    inputTokens: 60,
    outputTokens: 20,
    totalTokens: 120,
    cacheReadTokens: 40,
    reasoningTokens: 7,
  })
})

test('chat usage also reads cache_creation/read fields', () => {
  const usage = chatTokenUsage({
    prompt_tokens: 50,
    completion_tokens: 10,
    cache_read_input_tokens: 10,
    cache_creation_input_tokens: 5,
  })
  assert.equal(usage.inputTokens, 40)
  assert.equal(usage.cacheReadTokens, 10)
  assert.equal(usage.cacheWriteTokens, 5)
})

test('missing usage stays missing rather than fabricated', () => {
  assert.equal(chatTokenUsage({}), undefined)
  assert.equal(messagesTokenUsage({}), undefined)
  assert.equal(responsesTokenUsage({}), undefined)
  // A lone total or a lone side cannot be split without inventing counters.
  assert.equal(chatTokenUsage({ total_tokens: 12 }), undefined)
  assert.equal(chatTokenUsage({ prompt_tokens: 10 }), undefined)
  assert.equal(messagesTokenUsage({ input_tokens: 10 }), undefined)
  assert.equal(responsesTokenUsage({ total_tokens: 20 }), undefined)
  assert.equal(responsesTokenUsage({ output_tokens: 8 }), undefined)
})

test('Messages usage totals include cache categories', () => {
  const usage = messagesTokenUsage({
    input_tokens: 10,
    output_tokens: 5,
    cache_read_input_tokens: 3,
    cache_creation_input_tokens: 2,
  })
  assert.deepEqual(usage, {
    inputTokens: 10,
    outputTokens: 5,
    totalTokens: 20,
    cacheReadTokens: 3,
    cacheWriteTokens: 2,
  })
})

test('Responses usage subtracts cached input and keeps reasoning as a subtotal', () => {
  const usage = responsesTokenUsage({
    input_tokens: 12,
    output_tokens: 8,
    total_tokens: 20,
    input_tokens_details: { cached_tokens: 2 },
    output_tokens_details: { reasoning_tokens: 3 },
  })
  assert.deepEqual(usage, {
    inputTokens: 10,
    outputTokens: 8,
    totalTokens: 20,
    cacheReadTokens: 2,
    reasoningTokens: 3,
  })
})
