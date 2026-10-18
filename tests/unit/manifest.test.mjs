import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (name) => readFileSync(join(root, name), 'utf8')
const pkg = JSON.parse(read('package.json'))

test('bundle manifest exposes the host entry, client entry, patch, icon, and metadata', () => {
  assert.equal(pkg.name, 'dsh-nanogpt')
  assert.equal(pkg.type, 'module')
  assert.equal(pkg.main, 'lib/index.js')
  assert.equal(pkg.exports['.'].default, './lib/index.js')
  assert.equal(pkg.exports['./client'], './client.js')
  assert.equal(pkg.exports['./package.json'], './package.json')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-connection'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-locale'))
  assert.ok(pkg.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-slots'))
  assert.equal(pkg.icon, './icon.svg')
  assert.equal(pkg.meta.title, 'NanoGPT')
  for (const file of [
    'cordis.patch.yml',
    'icon.svg',
    'client.js',
    'lib/index.js',
    'lib/index.d.ts',
    'locale/en.json',
    'locale/ru.json',
  ]) {
    assert.equal(existsSync(join(root, file)), true, `${file} must exist`)
  }
})

test('the bundle patch inserts exactly one enabled NanoGPT row', () => {
  const patch = read('cordis.patch.yml')
  const rows = patch.match(/^\s*- id: .+$/gm) ?? []
  assert.equal(rows.length, 1)
  assert.match(patch, /- id: llm-nanogpt/)
  assert.match(patch, /name: dsh-nanogpt/)
  assert.doesNotMatch(patch, /disabled:\s*true/)
})

test('the host entry exports the Cordis plugin contract and a Config schema', async () => {
  const host = await import(join(root, 'lib/index.js'))
  assert.equal(typeof host.apply, 'function')
  assert.equal(typeof host.name, 'string')
  assert.equal(host.name, 'llm-nanogpt')
  assert.deepEqual(host.inject, ['llm'])
  assert.equal(typeof host.Config, 'function')
})

test('the client entry is a DSH module-loader factory with no harness imports', () => {
  const client = read('client.js')
  assert.match(client, /window\.__ModuleLoader__\.load/)
  assert.match(client, /id:\s*'dsh-nanogpt'/)
  assert.match(client, /factory\s*\(/)
  assert.match(client, /settings\.section/)
  assert.match(client, /\/nanogpt/)
  // The browser bundle must be plain JS with React from the module table only.
  assert.doesNotMatch(client, /@deepseek-ai\//)
  assert.doesNotMatch(client, /from\s+['"]react['"]/)
  assert.doesNotMatch(client, /localStorage|sessionStorage|document\.cookie/)
  assert.doesNotMatch(client, /dangerouslySetInnerHTML|\.innerHTML\s*=/)
  assert.doesNotMatch(client, /\beval\s*\(|new Function\s*\(/)
  // No embedded credential value: only the reference name may appear.
  assert.doesNotMatch(client, /sk-[A-Za-z0-9_-]{12,}/)
})

test('locale metadata and dictionaries are valid JSON and cover both languages', () => {
  const en = JSON.parse(read('locale/en.json'))
  const ru = JSON.parse(read('locale/ru.json'))
  for (const field of ['title', 'description']) {
    assert.equal(typeof en[field], 'string')
    assert.equal(typeof ru[field], 'string')
    assert.ok(en[field].length > 0)
    assert.ok(ru[field].length > 0)
  }
})
