import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fixture, jsonResponse, mockFetch } from '../helpers.mjs'
import { CatalogManager, validateCacheDocument } from '../../lib/catalog-store.js'
import { testConfig } from '../helpers.mjs'

const catalog = fixture('models-detailed.json')

async function harness(routes, { config = testConfig(), cachePath } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-nanogpt-catalog-'))
  const mock = mockFetch(routes)
  const manager = new CatalogManager({
    config: () => config,
    resolveApiKey: async () => undefined,
    deps: { fetch: mock.fetch, attribution: { 'user-agent': 'test' } },
    logger: { info() {}, warn() {} },
    cachePath: cachePath ?? join(dir, 'catalog.json'),
  })
  return { manager, mock, dir, cachePath: cachePath ?? join(dir, 'catalog.json') }
}

test('a successful refresh replaces the snapshot and writes a private cache', async () => {
  const h = await harness([['/models', () => jsonResponse(catalog)]])
  try {
    assert.equal(h.manager.current(), undefined)
    const result = await h.manager.refresh('test')
    assert.equal(result.refreshed, true)
    assert.equal(result.changed, true)
    assert.equal(result.cacheWritten, true)
    assert.equal(h.manager.models().length, 6)
    assert.equal(h.manager.status().status, 'ready')
    const cache = JSON.parse(await readFile(h.cachePath, 'utf8'))
    assert.equal(cache.version, 1)
    assert.equal(cache.endpoint, 'https://api.nano-gpt.com/api/v1/models?detailed=true')
    assert.equal(cache.models.length, 6)
  } finally {
    await rm(h.dir, { recursive: true, force: true })
  }
})

test('a failed refresh keeps the last good catalog and reports the failure', async () => {
  let fail = false
  const h = await harness([
    ['/models', () => fail
      ? new Response(JSON.stringify({ error: { message: 'upstream down' } }), { status: 503, headers: { 'Content-Type': 'application/json' } })
      : jsonResponse(catalog)],
  ])
  try {
    await h.manager.refresh('first')
    assert.equal(h.manager.models().length, 6)
    fail = true
    const result = await h.manager.refresh('second')
    assert.equal(result.refreshed, false)
    assert.equal(result.failure.code, 'SERVER')
    assert.equal(h.manager.models().length, 6)
    const status = h.manager.status()
    assert.equal(status.status, 'ready')
    assert.equal(status.error.code, 'SERVER')
    assert.equal(status.stale, false)
  } finally {
    await rm(h.dir, { recursive: true, force: true })
  }
})

test('concurrent refreshes share one network attempt', async () => {
  let resolve
  const gate = new Promise((r) => { resolve = r })
  const h = await harness([['/models', async () => {
    await gate
    return jsonResponse(catalog)
  }]])
  try {
    const first = h.manager.refresh('a')
    const second = h.manager.refresh('b')
    resolve()
    const [one, two] = await Promise.all([first, second])
    assert.equal(one, two)
    assert.equal(h.mock.calls.length, 1)
  } finally {
    await rm(h.dir, { recursive: true, force: true })
  }
})

test('cache load validates version, endpoint, and model identity', async () => {
  const h = await harness([['/models', () => jsonResponse(catalog)]])
  try {
    await h.manager.refresh('write')
    const restored = new CatalogManager({
      config: () => testConfig(),
      resolveApiKey: async () => undefined,
      deps: { fetch: mockFetch([]).fetch, attribution: {} },
      logger: { info() {}, warn() {} },
      cachePath: h.cachePath,
    })
    assert.equal(await restored.loadCache(), true)
    assert.equal(restored.models().length, 6)
    assert.equal(restored.current().source, 'cache')

    const other = new CatalogManager({
      config: () => testConfig({ baseURL: 'https://gateway.example/v1' }),
      resolveApiKey: async () => undefined,
      deps: { fetch: mockFetch([]).fetch, attribution: {} },
      logger: { info() {}, warn() {} },
      cachePath: h.cachePath,
    })
    assert.equal(await other.loadCache(), false)
    assert.equal(other.current(), undefined)
  } finally {
    await rm(h.dir, { recursive: true, force: true })
  }
})

test('validateCacheDocument refuses malformed and unsafe cache documents', () => {
  const endpoint = 'https://api.nano-gpt.com/api/v1/models?detailed=true'
  assert.equal(validateCacheDocument({ version: 2 }, endpoint), undefined)
  assert.equal(validateCacheDocument({ version: 1, endpoint, fetchedAt: 'x', hash: 'h', models: [] }, endpoint), undefined)
  assert.equal(validateCacheDocument({ version: 1, endpoint, fetchedAt: '2026-01-01', hash: 'h', models: [{ name: 'x' }] }, endpoint), undefined)
  const valid = validateCacheDocument(
    { version: 1, endpoint, fetchedAt: '2026-01-01T00:00:00.000Z', hash: 'h', rawCount: 1, models: [{ id: 'a/b', name: 'A' }] },
    endpoint,
  )
  assert.ok(valid)
  assert.equal(valid.source, 'cache')
})

test('dispose aborts an in-flight catalog fetch', async () => {
  let started
  const startedPromise = new Promise((resolve) => { started = resolve })
  const mock = {
    calls: [],
    fetch: async (_url, init) => {
      started()
      return await new Promise((_resolve, reject) => {
        const abort = () => reject(new Error('aborted'))
        if (init.signal.aborted) abort()
        else init.signal.addEventListener('abort', abort, { once: true })
      })
    },
  }
  const dir = await mkdtemp(join(tmpdir(), 'dsh-nanogpt-catalog-abort-'))
  const manager = new CatalogManager({
    config: () => testConfig(),
    resolveApiKey: async () => undefined,
    deps: { fetch: mock.fetch, attribution: {} },
    logger: { info() {}, warn() {} },
    cachePath: join(dir, 'catalog.json'),
  })
  try {
    const pending = manager.refresh('abort-test')
    await startedPromise
    manager.dispose()
    const result = await pending
    assert.equal(result.refreshed, false)
    assert.equal(result.failure.code, 'ABORTED')
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('dispose prevents later refresh and cache reads', async () => {
  const h = await harness([['/models', () => jsonResponse(catalog)]])
  try {
    h.manager.dispose()
    const result = await h.manager.refresh('after-dispose')
    assert.equal(result.refreshed, false)
    assert.equal(result.failure.code, 'DISPOSED')
    assert.equal(await h.manager.loadCache(), false)
    assert.equal(h.mock.calls.length, 0)
  } finally {
    await rm(h.dir, { recursive: true, force: true })
  }
})
