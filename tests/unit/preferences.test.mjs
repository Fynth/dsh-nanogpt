import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PreferencesStore, PreferencesError, normalizePreferences, preferenceOverrides } from '../../lib/preferences.js'

async function tempStore() {
  const dir = await mkdtemp(join(tmpdir(), 'dsh-nanogpt-prefs-'))
  const path = join(dir, 'preferences.json')
  return { store: new PreferencesStore({ path }), path, async cleanup() { await rm(dir, { recursive: true, force: true }) } }
}

test('preferences store persists revisions atomically', async () => {
  const { store, path, cleanup } = await tempStore()
  try {
    await store.load()
    assert.equal(store.current().revision, 1)
    const first = await store.update({ favorites: ['a/b'], hidden: ['c/d'] })
    assert.equal(first.preferences.revision, 2)
    const second = await store.update({ defaultModel: 'a/b', defaultReasoningEffort: 'high', reasoningVisibility: 'hide' }, 2)
    assert.equal(second.preferences.revision, 3)
    const raw = JSON.parse(await readFile(path, 'utf8'))
    assert.deepEqual(raw.favorites, ['a/b'])
    assert.equal(raw.defaultReasoningEffort, 'high')
    assert.equal(raw.reasoningVisibility, 'hide')
  } finally {
    await cleanup()
  }
})

test('stale revisions are refused without changing the document', async () => {
  const { store, cleanup } = await tempStore()
  try {
    await store.load()
    await store.update({ favorites: ['a'] })
    await assert.rejects(() => store.update({ favorites: ['b'] }, 1), (error) => error.code === 'STALE_REVISION')
    assert.deepEqual(store.current().favorites, ['a'])
  } finally {
    await cleanup()
  }
})

test('legacy off migrates to none and unknown levels are dropped', () => {
  const migrated = normalizePreferences({
    version: 1,
    revision: 3,
    defaultReasoningEffort: 'off',
    models: {
      'x/y': { defaultEffort: 'off', reasoningEfforts: ['none', 'low', 'ultra', 'high'] },
      'z/w': { reasoningEfforts: ['bogus'] },
    },
  })
  assert.equal(migrated.defaultReasoningEffort, 'none')
  assert.deepEqual(migrated.models['x/y'].reasoningEfforts, ['none', 'low', 'high'])
  assert.equal(migrated.models['x/y'].defaultEffort, 'none')
  assert.equal(migrated.models['z/w'].reasoningEfforts, undefined)
})

test('object-prototype spellings cannot pollute the preferences record', async () => {
  const normalized = normalizePreferences(
    JSON.parse('{"version":1,"revision":1,"models":{"__proto__":{"defaultEffort":"high"},"constructor":{"enabled":false},"safe/model":{"enabled":true}}}'),
  )
  assert.deepEqual(Object.keys(normalized.models), ['safe/model'])
  assert.equal(Object.getPrototypeOf(normalized.models), Object.prototype)
  assert.equal({}.defaultEffort, undefined)
  const { store, cleanup } = await tempStore()
  try {
    await store.load()
    await assert.rejects(
      () => store.update({ models: JSON.parse('{"__proto__":{"defaultEffort":"high"}}') }),
      (error) => error instanceof PreferencesError && /reserved model id/.test(error.message),
    )
    assert.equal({}.defaultEffort, undefined)
  } finally {
    await cleanup()
  }
})

test('preference overrides become adapter overrides', () => {
  const preferences = normalizePreferences({
    version: 1,
    revision: 1,
    models: {
      'x/y': {
        name: 'Y',
        reasoningEfforts: ['low', 'max'],
        defaultEffort: 'max',
        protocol: 'messages',
        routing: { mode: 'price' },
        advanced: { maxTokens: 100 },
      },
    },
  })
  const overrides = preferenceOverrides(preferences)
  assert.equal(overrides.length, 1)
  assert.equal(overrides[0].id, 'x/y')
  assert.deepEqual(overrides[0].reasoningEfforts, ['low', 'max'])
  assert.equal(overrides[0].defaultEffort, 'max')
  assert.equal(overrides[0].protocol, 'messages')
  assert.deepEqual(overrides[0].routing, { mode: 'price' })
  assert.equal(overrides[0].advanced.maxTokens, 100)
  assert.equal(overrides[0].source, 'user-config')
})

test('export contains no credentials and import refuses secret fields', async () => {
  const { store, cleanup } = await tempStore()
  try {
    await store.load()
    await store.update({ favorites: ['a/b'] })
    const exported = store.export()
    assert.equal(exported.includes('apiKey'), false)
    assert.equal(exported.includes('Bearer'), false)
    await assert.rejects(() => store.import({ version: 1, revision: 99, apiKey: 'secret' }), /must not contain "apiKey"/)
    assert.deepEqual(store.current().favorites, ['a/b'])
  } finally {
    await cleanup()
  }
})

test('import validates and replaces the document', async () => {
  const { store, cleanup } = await tempStore()
  try {
    await store.load()
    const before = store.current().revision
    const result = await store.import({ version: 1, revision: 1, favorites: ['n/m'], hidden: ['h/i'], ui: { sort: 'context' } })
    assert.equal(result.preferences.revision, before + 1)
    assert.deepEqual(result.preferences.favorites, ['n/m'])
    assert.equal(result.preferences.ui.sort, 'context')
  } finally {
    await cleanup()
  }
})

test('malformed preference files are reported and preserved beside the live path', async () => {
  const { store, path, cleanup } = await tempStore()
  try {
    const { writeFile, readdir } = await import('node:fs/promises')
    const { dirname } = await import('node:path')
    await writeFile(path, '{not json')
    await assert.rejects(() => store.load(), PreferencesError)
    const files = await readdir(dirname(path))
    assert.equal(files.some((file) => file.includes('.corrupt-')), true)
    // The live path is free for the normalized defaults, so a later write is safe.
    assert.equal(files.includes('preferences.json'), false)
  } finally {
    await cleanup()
  }
})
