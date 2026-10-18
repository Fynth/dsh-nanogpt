import test from 'node:test'
import assert from 'node:assert/strict'
import { parseSse, parseJsonEvent, SseIdleTimeoutError, MAX_SSE_LINE_BYTES } from '../../lib/sse.js'
import { sseStream } from '../helpers.mjs'

async function events(text, chunkSize = 5) {
  const result = []
  for await (const event of parseSse(sseStream(text, chunkSize), { idleTimeoutMs: 5_000 })) result.push(event)
  return result
}

test('SSE parser handles arbitrary byte boundaries, CRLF, comments, and multi-line data', async () => {
  const text = [
    ': heartbeat\r\n\r\n',
    'event: message\r\n',
    'data: {"a":1}\r\n\r\n',
    'data: first line\n',
    'data: second line\n\n',
    'data: héllo 🌍\n\n',
    'data: [DONE]\n\n',
  ].join('')
  const result = await events(text, 1)
  assert.equal(result.length, 4)
  assert.equal(result[0].event, 'message')
  assert.equal(result[0].data, '{"a":1}')
  assert.equal(result[1].data, 'first line\nsecond line')
  assert.equal(result[2].data, 'héllo 🌍')
  assert.equal(result[3].data, '[DONE]')
})

test('SSE parser dispatches a final unterminated data line', async () => {
  const result = await events('data: {"tail":true}', 3)
  assert.equal(result.length, 1)
  assert.equal(result[0].data, '{"tail":true}')
})

test('SSE parser refuses an oversized line instead of buffering without bound', async () => {
  const oversize = `data: ${'x'.repeat(MAX_SSE_LINE_BYTES + 1)}\n\n`
  await assert.rejects(
    async () => {
      for await (const _event of parseSse(sseStream(oversize, 64 * 1024), { idleTimeoutMs: 5_000 })) {
        // The parser must throw before yielding.
      }
    },
    (error) => error.code === 'MALFORMED_RESPONSE',
  )
})

test('JSON decode failures do not echo the payload', () => {
  assert.throws(
    () => parseJsonEvent({ data: '{not json secret-prompt}' }, 'Chat Completions'),
    (error) => error.code === 'MALFORMED_RESPONSE' && !error.message.includes('secret-prompt'),
  )
  assert.throws(
    () => parseJsonEvent({ data: '[1,2]' }, 'Responses'),
    (error) => error.code === 'MALFORMED_RESPONSE',
  )
})

test('idle timeout aborts a silent stream', async () => {
  const silent = new ReadableStream({ start() {} })
  await assert.rejects(
    async () => {
      for await (const _event of parseSse(silent, { idleTimeoutMs: 25 })) {
        // Never reached.
      }
    },
    SseIdleTimeoutError,
  )
})

test('caller cancellation aborts the parser', async () => {
  const controller = new AbortController()
  const silent = new ReadableStream({ start() {} })
  const promise = (async () => {
    for await (const _event of parseSse(silent, { idleTimeoutMs: 5_000, signal: controller.signal })) {
      // Never reached.
    }
  })()
  setTimeout(() => controller.abort(), 10)
  await assert.rejects(promise, (error) => error.code === 'ABORTED')
})
