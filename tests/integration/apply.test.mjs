import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixture, jsonResponse, mockFetch, streamResponse } from '../helpers.mjs'
import { apply, createConfigReader } from '../../lib/index.js'
import { plainOptions, resolveConfig } from '../../lib/config.js'

const catalogBody = fixture('models-detailed.json')

/**
 * Build the live Config face the loader passes to apply: every volatile field
 * exposes get(), and retryPolicy is a plain resolved value.
 */
function configFace(overrides = {}) {
  const resolved = resolveConfig({
    apiKeyEnv: 'NANOGPT_API_KEY',
    baseURL: 'https://api.nano-gpt.com/api/v1',
    autoRefresh: true,
    ...overrides,
  })
  const face = {
    apiKeyEnv: { get: () => resolved.apiKeyEnv },
    baseURL: { get: () => resolved.baseURL },
    displayName: { get: () => resolved.displayName },
    defaultModel: { get: () => resolved.defaultModel },
    defaultReasoningEffort: { get: () => resolved.defaultReasoningEffort },
    reasoningVisibility: { get: () => resolved.reasoningVisibility },
    protocol: { get: () => resolved.protocol },
    defaultMaxTokens: { get: () => resolved.defaultMaxTokens },
    temperature: { get: () => resolved.temperature },
    topP: { get: () => resolved.topP },
    experimentalEfforts: { get: () => resolved.experimentalEfforts },
    autoRefresh: { get: () => resolved.autoRefresh },
    refreshMinutes: { get: () => resolved.refreshMinutes },
    requestTimeoutMs: { get: () => resolved.requestTimeoutMs },
    streamIdleTimeoutMs: { get: () => resolved.streamIdleTimeoutMs },
    allowPrivateEndpoints: { get: () => resolved.allowPrivateEndpoints },
    allowInsecureEndpoints: { get: () => resolved.allowInsecureEndpoints },
    models: { get: () => resolved.models },
    routing: { get: () => resolved.routing },
    advanced: { get: () => resolved.advanced },
    retryPolicy: undefined,
  }
  return face
}

/**
 * Minimal Cordis host context capturing the registrations the plugin makes.
 */
function hostHarness({ config = configFace(), mock } = {}) {
  const registrations = {
    directory: [],
    adapters: [],
    discovery: new Map(),
    rpcChannel: undefined,
    rpcHandler: undefined,
    effects: [],
  }
  const credentials = {
    describe: async () => ({ configured: true, writable: true, source: 'store' }),
    resolve: async () => ({ value: 'test-key' }),
    set: async () => undefined,
    unset: async () => undefined,
  }
  const connection = {
    rpc: {
      handle(channel, handler) {
        registrations.rpcChannel = channel
        registrations.rpcHandler = handler
        return async () => undefined
      },
    },
  }
  const fakeLlm = {
    registerConfigurableProviders(entries) {
      registrations.directory.push(...entries)
      return Object.assign(() => undefined, { replace() {} })
    },
    registerAdapter(providers, adapter) {
      registrations.adapters.push(...providers.map((provider) => ({ provider, adapter })))
      return Object.assign(() => undefined, { replace() {} })
    },
    registerModelDiscovery(ns, discover) {
      registrations.discovery.set(ns, discover)
      return () => undefined
    },
    fileRequestText: () => '[test file]',
  }
  const ctx = {
    logger: { info() {}, warn() {} },
    get(name) {
      if (name === 'credentials') return credentials
      if (name === 'attachments') return undefined
      return undefined
    },
    llm: fakeLlm,
    emit() {},
    effect(fn) {
      const dispose = fn()
      registrations.effects.push(dispose)
      return () => undefined
    },
    inject(deps, callback) {
      if (deps.includes('connection')) {
        callback({
          get(name) {
            return name === 'connection' ? connection : undefined
          },
          effect(fn) {
            const dispose = fn()
            registrations.effects.push(dispose)
            return () => undefined
          },
        })
      }
    },
  }
  return { ctx, registrations, config, credentials, connection, mock }
}

async function waitFor(predicate, timeoutMs = 3_000) {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    if (await predicate()) return true
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  return false
}

test('apply wires the adapter, directory, discovery offer, scheduler, and RPC channel', async () => {
  const home = await mkdtemp(join(tmpdir(), 'dsh-nanogpt-apply-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const mock = mockFetch([
    ['/models', () => jsonResponse(catalogBody)],
    ['/chat/completions', () => streamResponse('data: [DONE]\n\n')],
  ])
  const previousFetch = globalThis.fetch
  globalThis.fetch = mock.fetch
  try {
    const harness = hostHarness({ mock })
    apply(harness.ctx, harness.config)
    const { registrations } = harness

    assert.deepEqual(registrations.adapters.map((entry) => entry.provider), ['nanogpt'])
    assert.equal(registrations.directory.length, 1)
    assert.equal(registrations.directory[0].provider, 'nanogpt')
    assert.equal(registrations.directory[0].settingsNs, 'llm-nanogpt')
    assert.equal(registrations.rpcChannel, '/nanogpt')
    assert.equal(typeof registrations.rpcHandler, 'function')

    const discover = registrations.discovery.get('llm-nanogpt')
    assert.equal(typeof discover, 'function')

    const adapter = registrations.adapters[0].adapter
    assert.ok(await waitFor(() => mock.calls.some((call) => call.url.includes('/models?detailed=true'))))
    assert.ok(await waitFor(async () => (await adapter.listModels('nanogpt')).length > 0))
    const models = await adapter.listModels('nanogpt')
    assert.ok(models.length > 0)
    assert.equal(models.some((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017'), true)

    const discovered = await discover({}, new AbortController().signal)
    assert.ok(discovered.length > 0)
    assert.equal(discovered[0].id.includes('/'), true)

    // A draft key must never be sent to a different endpoint.
    const before = mock.calls.length
    await assert.rejects(
      () => discover({ baseURL: 'https://attacker.example/v1', apiKey: 'should-not-leak' }, new AbortController().signal),
      /only targets the configured NanoGPT origin/,
    )
    assert.equal(mock.calls.length, before)

    const reply = await registrations.rpcHandler('status', {}, new AbortController().signal)
    assert.equal(reply.ok, true)
    assert.equal(reply.value.provider, 'nanogpt')
    assert.equal(JSON.stringify(reply.value).includes('test-key'), false)

    for (const dispose of registrations.effects) {
      if (typeof dispose === 'function') await dispose()
    }
  } finally {
    globalThis.fetch = previousFetch
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
})

test('config reader keeps the last good connection facts after an invalid edit', () => {
  const face = configFace()
  const warnings = []
  const read = createConfigReader(face, { warn: (message) => warnings.push(message) })
  const first = read()
  assert.equal(first.baseURL, 'https://api.nano-gpt.com/api/v1')
  face.baseURL = { get: () => 'not a url' }
  const second = read()
  assert.equal(second.baseURL, first.baseURL)
  assert.equal(warnings.length, 2)
  // The same object keeps serving; a further invalid read does not spam warnings.
  assert.equal(read().baseURL, first.baseURL)
  assert.equal(warnings.length, 2)
})

test('plainOptions is a complete snapshot of the volatile config face', () => {
  const face = configFace({ autoRefresh: false })
  const options = plainOptions(face)
  const resolved = resolveConfig(options)
  assert.equal(resolved.provider, 'nanogpt')
  assert.equal(resolved.baseURL, 'https://api.nano-gpt.com/api/v1')
  assert.equal(resolved.autoRefresh, false)
})
