import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogFixture, collect, sseStream } from '../helpers.mjs'
import { translateChatStream } from '../../lib/stream/chat.js'
import { translateResponsesStream } from '../../lib/stream/responses.js'
import { translateMessagesStream } from '../../lib/stream/messages.js'

const { models } = catalogFixture()
const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')

const chatSse = [
  'data: {"id":"chatcmpl_1","model":"deepseek/deepseek-v4.1-flash-1017","choices":[{"index":0,"delta":{"reasoning":"Think "}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"reasoning_content":"more."}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"content":"Hello "}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"content":"world."}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{\\"pa"}}]}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"function":{"arguments":"th\\":\\"a.ts\\"}"}}]}}]}',
  '',
  'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
  '',
  'data: {"usage":{"prompt_tokens":100,"completion_tokens":20,"total_tokens":120,"prompt_tokens_details":{"cached_tokens":40},"completion_tokens_details":{"reasoning_tokens":7}},"x_nanogpt_pricing":{"cost":0.0012}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

test('chat stream preserves reasoning, text, tool calls, usage, and replay metadata', async () => {
  const metrics = {}
  const chunks = await collect(
    translateChatStream(sseStream(chatSse, 7), { model: deepseek, idleTimeoutMs: 5_000, metrics, requestId: 'req_1' }),
  )
  const starts = chunks.filter((chunk) => chunk.type === 'block-start')
  assert.deepEqual(starts.map((chunk) => chunk.blockType), ['reasoning', 'text', 'tool-call'])
  const ends = chunks.filter((chunk) => chunk.type === 'block-end')
  assert.equal(ends.length, 3)
  assert.equal(ends[0].block.text, 'Think more.')
  assert.equal(ends[1].block.text, 'Hello world.')
  assert.equal(ends[2].block.name, 'read_file')
  assert.equal(ends[2].block.arguments, '{"path":"a.ts"}')
  const usage = chunks.find((chunk) => chunk.type === 'usage')
  assert.deepEqual(usage.usage, {
    inputTokens: 60,
    outputTokens: 20,
    totalTokens: 120,
    cacheReadTokens: 40,
    reasoningTokens: 7,
  })
  assert.deepEqual(metrics, { usage: usage.usage, costUsd: 0.0012 })
  const finish = chunks.at(-1)
  assert.equal(finish.type, 'finish')
  assert.equal(finish.reason.kind, 'tool-calls')
  assert.equal(finish.replayState.response.protocol, 'chat')
  assert.equal(finish.replayState.response.responseId, 'chatcmpl_1')
  assert.equal(finish.replayState.response.blocks[2].id, 'call_1')
})

test('chat malformed tool arguments become a controlled failure', async () => {
  const sse = [
    'data: {"choices":[{"index":0,"delta":{"tool_calls":[{"index":0,"id":"call_1","function":{"name":"read_file","arguments":"{broken"}}]}}]}',
    '',
    'data: {"choices":[{"index":0,"delta":{},"finish_reason":"tool_calls"}]}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')
  await assert.rejects(
    () => collect(translateChatStream(sseStream(sse), { model: deepseek, idleTimeoutMs: 5_000 })),
    (error) => error.code === 'MALFORMED_TOOL_ARGUMENTS',
  )
})

test('chat empty completion is retryable EMPTY_RESPONSE', async () => {
  const sse = ['data: {"choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}', '', 'data: [DONE]', ''].join('\n')
  await assert.rejects(
    () => collect(translateChatStream(sseStream(sse), { model: deepseek, idleTimeoutMs: 5_000 })),
    (error) => error.code === 'EMPTY_RESPONSE',
  )
})

test('chat mid-stream error is classified', async () => {
  const sse = [
    'data: {"error":{"status":503,"message":"Service temporarily unavailable","code":"service_unavailable"}}',
    '',
    'data: [DONE]',
    '',
  ].join('\n')
  await assert.rejects(
    () => collect(translateChatStream(sseStream(sse), { model: deepseek, idleTimeoutMs: 5_000 })),
    (error) => error.code === 'SERVER' || error.code === 'HTTP_503',
  )
})

const responsesSse = [
  'data: {"type":"response.created","response":{"id":"resp_1","model":"deepseek/deepseek-v4.1-flash-1017"}}',
  '',
  'data: {"type":"response.output_item.added","output_index":0,"item":{"type":"reasoning","id":"r1"}}',
  '',
  'data: {"type":"response.reasoning.delta","item_id":"r1","delta":"Think"}',
  '',
  'data: {"type":"response.output_item.done","output_index":0,"item":{"type":"reasoning","id":"r1","content":[{"type":"reasoning_text","text":"Think"}]}}',
  '',
  'data: {"type":"response.output_item.added","output_index":1,"item":{"type":"message","id":"msg_1"}}',
  '',
  'data: {"type":"response.output_text.delta","item_id":"msg_1","delta":"Hello"}',
  '',
  'data: {"type":"response.output_item.added","output_index":2,"item":{"type":"function_call","id":"fc_1","call_id":"call_9","name":"read_file","arguments":""}}',
  '',
  'data: {"type":"response.function_call_arguments.delta","item_id":"fc_1","delta":"{\\"path\\":\\"a.ts\\"}"}',
  '',
  'data: {"type":"response.output_item.done","output_index":2,"item":{"type":"function_call","id":"fc_1","call_id":"call_9","name":"read_file","arguments":"{\\"path\\":\\"a.ts\\"}"}}',
  '',
  'data: {"type":"response.completed","response":{"id":"resp_1","model":"deepseek/deepseek-v4.1-flash-1017","status":"completed","usage":{"input_tokens":12,"output_tokens":8,"total_tokens":20,"input_tokens_details":{"cached_tokens":2},"output_tokens_details":{"reasoning_tokens":3}},"output":[{"type":"reasoning","id":"r1","content":[{"type":"reasoning_text","text":"Think"}]},{"type":"message","id":"msg_1","content":[{"type":"output_text","text":"Hello"}]},{"type":"function_call","id":"fc_1","call_id":"call_9","name":"read_file","arguments":"{\\"path\\":\\"a.ts\\"}"}]}}',
  '',
  'data: [DONE]',
  '',
].join('\n')

test('responses stream normalizes reasoning, text, tools, and final usage', async () => {
  const chunks = await collect(
    translateResponsesStream(sseStream(responsesSse, 9), { model: deepseek, idleTimeoutMs: 5_000 }),
  )
  const starts = chunks.filter((chunk) => chunk.type === 'block-start')
  assert.deepEqual(starts.map((chunk) => chunk.blockType), ['reasoning', 'text', 'tool-call'])
  const ends = chunks.filter((chunk) => chunk.type === 'block-end')
  assert.equal(ends.find((chunk) => chunk.block.type === 'reasoning').block.text, 'Think')
  assert.equal(ends.find((chunk) => chunk.block.type === 'text').block.text, 'Hello')
  assert.equal(ends.find((chunk) => chunk.block.type === 'tool-call').block.arguments, '{"path":"a.ts"}')
  const usage = chunks.find((chunk) => chunk.type === 'usage')
  assert.deepEqual(usage.usage, {
    inputTokens: 10,
    outputTokens: 8,
    totalTokens: 20,
    cacheReadTokens: 2,
    reasoningTokens: 3,
  })
  const finish = chunks.at(-1)
  assert.equal(finish.reason.kind, 'tool-calls')
  assert.equal(finish.replayState.response.outputItems.length, 3)
})

const messagesSse = [
  'event: message_start',
  'data: {"type":"message_start","message":{"id":"msg_1","model":"deepseek/deepseek-v4.1-flash-1017","usage":{"input_tokens":10}}}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Think"}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":0,"delta":{"type":"signature_delta","signature":"sig-1"}}',
  '',
  'event: content_block_stop',
  'data: {"type":"content_block_stop","index":0}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"Hello"}}',
  '',
  'event: content_block_stop',
  'data: {"type":"content_block_stop","index":1}',
  '',
  'event: content_block_start',
  'data: {"type":"content_block_start","index":2,"content_block":{"type":"tool_use","id":"toolu_1","name":"read_file","input":{}}}',
  '',
  'event: content_block_delta',
  'data: {"type":"content_block_delta","index":2,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":\\"a.ts\\"}"}}',
  '',
  'event: content_block_stop',
  'data: {"type":"content_block_stop","index":2}',
  '',
  'event: message_delta',
  'data: {"type":"message_delta","delta":{"stop_reason":"tool_use"},"usage":{"output_tokens":5}}',
  '',
  'event: message_stop',
  'data: {"type":"message_stop"}',
  '',
].join('\n')

test('messages stream preserves thinking signatures, tool arguments, and usage', async () => {
  const chunks = await collect(
    translateMessagesStream(sseStream(messagesSse, 11), { model: deepseek, idleTimeoutMs: 5_000 }),
  )
  const starts = chunks.filter((chunk) => chunk.type === 'block-start')
  assert.deepEqual(starts.map((chunk) => chunk.blockType), ['reasoning', 'text', 'tool-call'])
  const ends = chunks.filter((chunk) => chunk.type === 'block-end')
  assert.equal(ends.find((chunk) => chunk.block.type === 'reasoning').block.text, 'Think')
  assert.equal(ends.find((chunk) => chunk.block.type === 'text').block.text, 'Hello')
  assert.equal(ends.find((chunk) => chunk.block.type === 'tool-call').block.arguments, '{"path":"a.ts"}')
  const usage = chunks.find((chunk) => chunk.type === 'usage')
  assert.equal(usage.usage.inputTokens, 10)
  assert.equal(usage.usage.outputTokens, 5)
  assert.equal(usage.usage.totalTokens, 15)
  const finish = chunks.at(-1)
  assert.equal(finish.reason.kind, 'tool-calls')
  assert.equal(finish.replayState.response.blocks[0].signature, 'sig-1')
})

test('messages stream without message_stop is a closed-stream failure', async () => {
  const sse = ['event: message_start', 'data: {"type":"message_start","message":{"id":"m"}}', ''].join('\n')
  await assert.rejects(
    () => collect(translateMessagesStream(sseStream(sse), { model: deepseek, idleTimeoutMs: 5_000 })),
    (error) => error.code === 'STREAM_CLOSED',
  )
})
