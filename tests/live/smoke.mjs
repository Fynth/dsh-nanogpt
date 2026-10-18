/**
 * Budgeted live smoke test for the NanoGPT adapter.
 *
 * Reads NANOGPT_API_KEY from the environment and makes a small number of real
 * requests. It never prints the key. Run manually:
 *
 *   NANOGPT_API_KEY=... node tests/live/smoke.mjs
 *
 * This file is not part of the packaged artifact or the default test gate.
 */
import { Context } from '@deepseek-ai/cordis'
import { attributionHeaders, LlmRuntime, ToolCallId, MessageId } from '@deepseek-ai/dsh-llm'
import { fetchCatalog, fetchProviderCatalog, testConnection } from '../../lib/discovery.js'
import { readBalance, readSubscription, readUsage } from '../../lib/usage.js'
import { NanoGptAdapter } from '../../lib/adapter.js'
import { Diagnostics } from '../../lib/diagnostics.js'
import { resolveConfig } from '../../lib/config.js'
import { defaultPreferences } from '../../lib/preferences.js'
import { collect } from '../helpers.mjs'

const BASE = 'https://api.nano-gpt.com/api/v1'
const ORIGIN = 'https://api.nano-gpt.com'
const KEY = process.env.NANOGPT_API_KEY
if (typeof KEY !== 'string' || KEY.trim().length === 0) {
  console.error('NANOGPT_API_KEY is required')
  process.exit(2)
}

const results = []
function record(name, ok, detail) {
  results.push({ name, ok, detail })
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const deps = { attribution: attributionHeaders(), fetch: globalThis.fetch }
const snapshot = await fetchCatalog({ baseURL: BASE, timeoutMs: 30_000 }, deps)
console.log(`catalog: ${snapshot.models.length} models`)
const modelById = new Map(snapshot.models.map((model) => [model.id, model]))
const effortModel = 'deepseek/deepseek-v4-flash-0731'
const TINY_PNG = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAJ0lEQVR42u3NsQkAAAjAsP7/tF7hIASyp6lTCQQCgUAgEAgEgi/BAjLD/C5w/SM9AAAAAElFTkSuQmCC'
const config = resolveConfig({ apiKeyEnv: 'NANOGPT_API_KEY', baseURL: BASE, requestTimeoutMs: 90_000, streamIdleTimeoutMs: 90_000 })
const preferences = defaultPreferences('2026-10-18T00:00:00.000Z')

const wireCalls = []
const fetchRecording = async (url, init) => {
  try {
    wireCalls.push({ url: String(url), body: init.body === undefined ? undefined : JSON.parse(String(init.body)), headers: init.headers })
  } catch {
    wireCalls.push({ url: String(url), body: undefined, headers: init.headers })
  }
  return globalThis.fetch(url, init)
}


function makeAdapter(protocol = 'chat', extra = {}) {
  const protocolConfig = resolveConfig({ apiKeyEnv: 'NANOGPT_API_KEY', baseURL: BASE, protocol, requestTimeoutMs: 90_000, streamIdleTimeoutMs: 90_000, ...extra })
  return new NanoGptAdapter({
    config: () => protocolConfig,
    catalog: () => ({ current: () => snapshot }),
    preferences: () => preferences,
    resolveApiKey: async () => KEY,
    resolveAttachments: () => ({
      readImageRequest: async (ref) => ({
        data: Buffer.from(TINY_PNG, 'base64'),
        mediaType: ref.mediaType,
        width: ref.width,
        height: ref.height,
      }),
    }),
    logger: { info() {}, warn() {} },
    fetch: fetchRecording,
    attribution: attributionHeaders,
    diagnostics: new Diagnostics(),
  })
}
const adapter = makeAdapter('chat')
const responsesAdapter = makeAdapter('responses')
const messagesAdapter = makeAdapter('messages')
const hideAdapter = makeAdapter('chat', { reasoningVisibility: 'hide' })


function textOf(chunks) {
  return chunks.filter((chunk) => chunk.type === 'text-delta').map((chunk) => chunk.text).join('')
}
function reasoningOf(chunks) {
  return chunks.filter((chunk) => chunk.type === 'reasoning-delta').map((chunk) => chunk.text).join('')
}
function finishOf(chunks) {
  return chunks.find((chunk) => chunk.type === 'finish')
}
function toolBlocks(chunks) {
  return chunks
    .filter((chunk) => chunk.type === 'block-end' && chunk.block.type === 'tool-call')
    .map((chunk) => chunk.block)
}

async function stream(name, options, verify, selectedAdapter = adapter) {
  wireCalls.length = 0
  try {
    const chunks = await collect(selectedAdapter.stream(options))
    const finish = finishOf(chunks)
    const detail = `finish=${finish ? finish.reason.kind : 'none'} text=${JSON.stringify(textOf(chunks).slice(0, 40))} reasoning=${reasoningOf(chunks).length}`
    const problem = verify({ chunks, finish, wire: wireCalls.at(-1) })
    record(name, problem === undefined && finish !== undefined && finish.reason.kind !== 'error', problem ?? detail)
    return { chunks, finish, wire: wireCalls.at(-1) }
  } catch (error) {
    record(name, false, `${error.code ?? 'ERROR'}: ${error.message}`)
    return undefined
  }
}

// 1. Account/authentication reads.
try {
  const test = await testConnection({ origin: ORIGIN, baseURL: BASE, apiKey: KEY, timeoutMs: 20_000 }, deps)
  record('connection test', test.status === 'connected' && test.authenticated === true, `${test.status} ${test.message}`)
  const balance = await readBalance({ origin: ORIGIN, baseURL: BASE, apiKey: KEY, attribution: deps.attribution, timeoutMs: 20_000 })
  record('balance read', balance.value !== undefined, balance.value ? `USD=${balance.value.usd} XNO=${balance.value.xno} (${balance.value.depositAddress ? 'address present' : 'no address'})` : `${balance.failure?.code}: ${balance.failure?.message}`)
  const usage = await readUsage({ origin: ORIGIN, baseURL: BASE, apiKey: KEY, attribution: deps.attribution, timeoutMs: 20_000 })
  record('usage read', usage.value !== undefined, usage.value ? `requests=${usage.value.requests} cost=${usage.value.netCostUsd}` : `${usage.failure?.code}: ${usage.failure?.message}`)
  const subscription = await readSubscription({ origin: ORIGIN, baseURL: BASE, apiKey: KEY, attribution: deps.attribution, timeoutMs: 20_000 })
  record('subscription read', subscription.value !== undefined, subscription.value ? `active=${subscription.value.active} quotas=${subscription.value.quotas?.length ?? 0}` : `${subscription.failure?.code}: ${subscription.failure?.message}`)
} catch (error) {
  record('account reads', false, error instanceof Error ? error.message : String(error))
}

// 2. Provider discovery.
try {
  const provider = await fetchProviderCatalog(ORIGIN, effortModel, deps, { apiKey: KEY, timeoutMs: 30_000 })
  record('provider discovery', provider.status === 'ok' && provider.catalog.providers.length > 0, provider.status === 'ok' ? `${provider.catalog.providers.length} routes` : provider.status)
} catch (error) {
  record('provider discovery', false, error instanceof Error ? error.message : String(error))
}

// 3. Chat reasoning levels, asserting the actual wire field.
for (const effort of ['none', 'low', 'high', 'max']) {
  await stream(`chat effort ${effort}`, {
    provider: 'nanogpt', model: effortModel, reasoningEffort: effort,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
    maxTokens: 64,
  }, ({ wire }) => {
    const sent = wire?.body?.reasoning_effort
    return sent === effort ? undefined : `wire effort=${String(sent)}`
  })
}

// 4. minimal on a model that advertises it.
await stream('chat effort minimal', {
  provider: 'nanogpt', model: 'inclusionai/ling-3.0-flash:thinking', reasoningEffort: 'minimal',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
  maxTokens: 256,
}, ({ wire }) => wire?.body?.reasoning_effort === 'minimal' ? undefined : `wire effort=${String(wire?.body?.reasoning_effort)}`)

// 4b. xhigh on the same model that advertises it.
await stream('chat effort xhigh', {
  provider: 'nanogpt', model: 'inclusionai/ling-3.0-flash:thinking', reasoningEffort: 'xhigh',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
  maxTokens: 256,
}, ({ wire }) => wire?.body?.reasoning_effort === 'xhigh' ? undefined : `wire effort=${String(wire?.body?.reasoning_effort)}`)

// 4c. medium on a subscription-included model that advertises it.
await stream('chat effort medium', {
  provider: 'nanogpt', model: 'inclusionai/ling-3.0-flash:thinking', reasoningEffort: 'medium',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
  maxTokens: 256,
}, ({ wire }) => wire?.body?.reasoning_effort === 'medium' ? undefined : `wire effort=${String(wire?.body?.reasoning_effort)}`)

// 4d. Hidden reasoning: output excluded, effort still sent, compute not disabled.
await stream('chat hide reasoning', {
  provider: 'nanogpt', model: effortModel, reasoningEffort: 'high',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
  maxTokens: 64,
}, ({ chunks, wire }) => {
  if (wire?.body?.reasoning_effort !== 'high') return 'effort missing under hide'
  if (wire?.body?.reasoning?.exclude !== true) return 'reasoning.exclude missing'
  if (reasoningOf(chunks).length > 0) return 'hidden reasoning was streamed'
  return undefined
}, hideAdapter)

// 5. Auto/provider default.
await stream('chat auto', {
  provider: 'nanogpt', model: effortModel,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
  maxTokens: 64,
}, ({ wire }) => ('reasoning_effort' in (wire?.body ?? {}) ? 'unexpected effort field' : undefined))

// 6. Responses protocol.
await stream('responses high', {
  provider: 'nanogpt', model: effortModel, reasoningEffort: 'high',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
  maxTokens: 128,
}, ({ wire }) => wire?.body?.reasoning?.effort === 'high' ? undefined : `wire reasoning=${JSON.stringify(wire?.body?.reasoning)}`, responsesAdapter)

// 7. Messages protocol.
await stream('messages high', {
  provider: 'nanogpt', model: effortModel, reasoningEffort: 'high',
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
  maxTokens: 128,
}, ({ wire }) => wire?.body?.output_config?.effort === 'high' ? undefined : `wire output_config=${JSON.stringify(wire?.body?.output_config)}`, messagesAdapter)

// 8. Tool call + continuation on Chat.
const tools = [{
  name: 'get_weather',
  description: 'Get the current weather for a city.',
  parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
}]
const first = await stream('chat tool call', {
  provider: 'nanogpt', model: effortModel, tools,
  messages: [{ role: 'user', content: [{ type: 'text', text: 'Use the get_weather tool for Paris. Do not answer without calling it.' }] }],
  maxTokens: 128,
}, ({ chunks }) => toolBlocks(chunks).length > 0 ? undefined : 'no tool-call block')
const call = first ? toolBlocks(first.chunks)[0] : undefined
if (call !== undefined) {
  const assistant = {
    role: 'assistant', id: MessageId('smoke-assistant'), source: { kind: 'model', provider: 'nanogpt', model: effortModel },
    content: [{ type: 'text', text: '' }, call],
  }
  const tool = {
    role: 'tool', id: MessageId('smoke-tool'), source: { kind: 'tool', callId: call.id }, toolCallId: call.id,
    content: [{ type: 'text', text: '{"temperatureC":21,"conditions":"clear"}' }],
  }
  await stream('chat tool continuation', {
    provider: 'nanogpt', model: effortModel, tools,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'Use the get_weather tool for Paris.' }] }, assistant, tool],
    maxTokens: 128,
  }, ({ chunks }) => textOf(chunks).length > 0 ? undefined : 'empty continuation text')
} else {
  record('chat tool continuation', false, 'skipped: no tool call')
}

// 9. Vision on Chat.
await stream('chat vision', {
  provider: 'nanogpt', model: 'deepseek/deepseek-v4.1-flash-1017',
  messages: [{
    role: 'user', content: [
      { type: 'text', text: 'This is a solid-color square. Reply with the color name only.' },
      { type: 'image', attachment: { attachmentId: 'smoke_img', mediaType: 'image/png', bytes: 96, width: 32, height: 32 } },
    ],
  }],
  maxTokens: 128,
}, ({ chunks, wire }) => {
  if (!JSON.stringify(wire?.body ?? {}).includes('data:image/png;base64')) return 'request did not carry inline image data'
  const text = textOf(chunks).toLowerCase()
  if (!text.includes('red')) return `answer did not name red: ${JSON.stringify(text.slice(0, 60))}`
  return undefined
})

// 9b. The native DSH LlmRuntime path (metadata, validation, prepare, stream).
try {
  const ctx = new Context()
  const llm = new LlmRuntime(ctx)
  const runtimeAdapter = makeAdapter('chat')
  const registration = llm.registerAdapter(['nanogpt'], runtimeAdapter)
  try {
    const info = await llm.resolveModelInfo('nanogpt', effortModel)
    const resolved = await llm.resolveCallConfig({ provider: 'nanogpt', model: effortModel, reasoningEffort: 'high' })
    const prepared = await llm.prepareCall({ provider: 'nanogpt', model: effortModel, reasoningEffort: 'high', maxTokens: 64 })
    wireCalls.length = 0
    const chunks = await collect(prepared.stream({
      provider: 'nanogpt', model: effortModel, reasoningEffort: 'high',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'Reply with the single word OK.' }] }],
      maxTokens: 64,
    }))
    const finish = finishOf(chunks)
    const ok = info.reasoning !== undefined
      && info.reasoning.efforts.some((effort) => String(effort.id) === 'high')
      && String(resolved.reasoningEffort) === 'high'
      && finish !== undefined
      && finish.reason.kind !== 'error'
      && textOf(chunks).length > 0
      && wireCalls.at(-1)?.body?.reasoning_effort === 'high'
    record('native DSH runtime chat high', ok, ok ? `finish=${finish.reason.kind} text=${JSON.stringify(textOf(chunks).slice(0, 20))}` : 'metadata/validation/stream mismatch')
  } finally {
    registration()
  }
} catch (error) {
  record('native DSH runtime chat high', false, `${error.code ?? 'ERROR'}: ${error.message}`)
}

// 10. Error handling: invalid credential must be classified.
try {
  const bad = await testConnection({ origin: ORIGIN, baseURL: BASE, apiKey: 'sk-invalid-smoke', timeoutMs: 20_000 }, deps)
  record('invalid key classification', bad.status === 'invalid-key' && bad.authenticated === false, bad.status)
} catch (error) {
  record('invalid key classification', false, error instanceof Error ? error.message : String(error))
}

const failed = results.filter((entry) => !entry.ok)
console.log(`\nSUMMARY: ${results.length - failed.length}/${results.length} checks passed`)
if (failed.length > 0) {
  console.error('Failures:')
  for (const entry of failed) console.error(`- ${entry.name}: ${entry.detail}`)
  process.exit(1)
}
