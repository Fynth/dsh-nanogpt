import test from 'node:test'
import assert from 'node:assert/strict'
import { testConfig } from '../helpers.mjs'
import { defaultPreferences } from '../../lib/preferences.js'
import { effectiveAdvanced, effectiveRouting } from '../../lib/protocols/common.js'
import {
  balanceEndpoint,
  Config,
  modelsEndpoint,
  normalizeBaseURL,
  plainOptions,
  providersEndpoint,
  resolveConfig,
  subscriptionUsageEndpoint,
  usageEndpoint,
} from '../../lib/config.js'

test('bare host and /api spellings normalize to the documented base', () => {
  assert.deepEqual(normalizeBaseURL('https://api.nano-gpt.com', { allowPrivate: false, allowInsecure: false }), {
    baseURL: 'https://api.nano-gpt.com/api/v1',
    origin: 'https://api.nano-gpt.com',
  })
  assert.equal(normalizeBaseURL('https://api.nano-gpt.com/api', { allowPrivate: false, allowInsecure: false }).baseURL, 'https://api.nano-gpt.com/api/v1')
  assert.equal(normalizeBaseURL('https://gateway.example/v1/', { allowPrivate: false, allowInsecure: false }).baseURL, 'https://gateway.example/v1')
  assert.equal(normalizeBaseURL('https://gateway.example/custom', { allowPrivate: false, allowInsecure: false }).baseURL, 'https://gateway.example/custom')
})

test('URL validation refuses credentials, fragments, plaintext, and private hosts', () => {
  assert.throws(() => normalizeBaseURL('https://user:pass@api.nano-gpt.com/api/v1', { allowPrivate: false, allowInsecure: false }), /credentials/)
  assert.throws(() => normalizeBaseURL('https://api.nano-gpt.com/api/v1?x=1', { allowPrivate: false, allowInsecure: false }), /query or fragment/)
  assert.throws(() => normalizeBaseURL('ftp://api.nano-gpt.com/api/v1', { allowPrivate: false, allowInsecure: false }), /http or https/)
  assert.throws(() => normalizeBaseURL('http://api.nano-gpt.com/api/v1', { allowPrivate: false, allowInsecure: false }), /plaintext/)
  assert.throws(() => normalizeBaseURL('https://192.168.1.10/api/v1', { allowPrivate: false, allowInsecure: false }), /private endpoint/)
  assert.throws(() => normalizeBaseURL('http://localhost:8080/api/v1', { allowPrivate: false, allowInsecure: false }), /private endpoint/)
  assert.throws(() => normalizeBaseURL('https://[::]/api/v1', { allowPrivate: false, allowInsecure: false }), /private endpoint/)
  assert.throws(() => normalizeBaseURL('https://[::ffff:127.0.0.1]/api/v1', { allowPrivate: false, allowInsecure: false }), /private endpoint/)
  assert.throws(() => normalizeBaseURL('https://[::ffff:7f00:1]/api/v1', { allowPrivate: false, allowInsecure: false }), /private endpoint/)
  assert.throws(() => normalizeBaseURL('https://[fd00::1]/api/v1', { allowPrivate: false, allowInsecure: false }), /private endpoint/)
  assert.doesNotThrow(() => normalizeBaseURL('http://localhost:8080/api/v1', { allowPrivate: true, allowInsecure: true }))
  assert.doesNotThrow(() => normalizeBaseURL('https://192.168.1.10/api/v1', { allowPrivate: true, allowInsecure: false }))
})

test('documented endpoints are derived from one base', () => {
  const config = testConfig()
  assert.equal(config.baseURL, 'https://api.nano-gpt.com/api/v1')
  assert.equal(modelsEndpoint(config.baseURL), 'https://api.nano-gpt.com/api/v1/models?detailed=true')
  assert.equal(providersEndpoint(config.origin, 'deepseek/deepseek-v4.1-flash-1017'), 'https://api.nano-gpt.com/api/models/deepseek%2Fdeepseek-v4.1-flash-1017/providers')
  assert.equal(balanceEndpoint(config.origin), 'https://api.nano-gpt.com/api/check-balance')
  assert.equal(usageEndpoint(config.baseURL), 'https://api.nano-gpt.com/api/v1/usage')
  assert.equal(subscriptionUsageEndpoint(config.origin), 'https://api.nano-gpt.com/api/subscription/v1/usage')
})

test('invalid effort defaults and model overrides fail loudly', () => {
  assert.throws(() => testConfig({ defaultReasoningEffort: 'ultra' }), /defaultReasoningEffort/)
  assert.throws(() => testConfig({ models: [{ id: 'x/y', reasoningEfforts: ['ultra'] }] }), /unknown reasoning effort/)
  assert.throws(() => testConfig({ models: [{ id: 'x/y', reasoningEfforts: ['low'], defaultEffort: 'max' }] }), /not in its declared efforts/)
  assert.throws(() => testConfig({ models: [{ id: 'x/y', reasoningEfforts: false, defaultEffort: 'high' }] }), /disables reasoning/)
  assert.throws(() => testConfig({ models: [{ id: 'x/y' }, { id: 'x/y' }] }), /duplicate model override/)
})

test('routing conflicts are rejected at configuration time', () => {
  assert.throws(() => testConfig({ routing: { mode: 'provider' } }), /requires a provider id/)
  assert.throws(() => testConfig({ routing: { mode: 'auto', provider: 'x' } }), /only valid with routing.mode "provider"/)
  assert.throws(() => testConfig({ routing: { mode: 'provider', provider: 'bad provider!' } }), /not a public provider id/)
})

test('advanced request controls are validated', () => {
  assert.throws(() => testConfig({ advanced: { webSearch: 'online/nope' } }), /not a supported suffix/)
  assert.throws(() => testConfig({ advanced: { temperature: 3 } }), /between 0 and 2/)
  assert.throws(() => testConfig({ advanced: { promptCaching: { ttl: '1h' } } }), /requires promptCaching.enabled/)
  assert.throws(() => testConfig({ advanced: { extraBody: { authorization: 'x' } } }), /reserved field/)
})

test('a schema-parsed model override mounts and does not reset global controls', () => {
  const parsed = Config({
    routing: { mode: 'price', caching: true },
    advanced: { promptCaching: { enabled: true, ttl: '1h' }, extraBody: { custom_flag: 10 } },
    models: [{ id: 'custom/one' }],
  })
  const resolved = resolveConfig(plainOptions(parsed))
  assert.equal(resolved.models.length, 1)
  assert.equal(resolved.models[0].id, 'custom/one')
  assert.equal(resolved.models[0].inputModalities, undefined)
  assert.equal(resolved.models[0].reasoningEfforts, undefined)
  assert.equal(resolved.models[0].routing, undefined)
  assert.equal(resolved.models[0].advanced, undefined)
  assert.deepEqual(resolved.routing, { mode: 'price', caching: true })
  assert.equal(resolved.advanced.promptCaching.enabled, true)
  assert.deepEqual(resolved.advanced.extraBody, { custom_flag: 10 })
})

test('schema-parsed empty arrays mean inherit, not an invalid empty declaration', () => {
  const parsed = Config({ models: [{ id: 'custom/two', inputModalities: [], reasoningEfforts: [] }] })
  const resolved = resolveConfig(plainOptions(parsed))
  assert.equal(resolved.models[0].inputModalities, undefined)
  assert.equal(resolved.models[0].reasoningEfforts, undefined)
})

test('partial model routing/advanced overrides merge over globals without resetting them', () => {
  const parsed = Config({
    routing: { mode: 'price', caching: true },
    advanced: { promptCaching: { enabled: true, ttl: '1h' }, extraBody: { foo: 1 }, temperature: 0.4 },
    models: [{ id: 'custom/x', routing: { caching: true }, advanced: { maxTokens: 100 } }],
  })
  const resolved = resolveConfig(plainOptions(parsed))
  const override = resolved.models[0]
  assert.deepEqual(override.routing, { caching: true })
  assert.equal(override.advanced.maxTokens, 100)
  assert.equal(override.advanced.promptCaching, undefined)
  assert.equal(override.advanced.extraBody, undefined)

  const model = {
    id: 'custom/x',
    name: 'X',
    aliases: [],
    serviceTiers: [],
    providers: [],
    source: 'user-config',
  }
  const preferences = defaultPreferences('2026-10-18T00:00:00.000Z')
  const routing = effectiveRouting(resolved, preferences, model)
  assert.equal(routing.mode, 'price')
  assert.equal(routing.caching, true)
  const advanced = effectiveAdvanced(resolved, preferences, model)
  assert.equal(advanced.maxTokens, 100)
  assert.equal(advanced.temperature, 0.4)
  assert.deepEqual(advanced.promptCaching, { enabled: true, ttl: '1h' })
  assert.deepEqual(advanced.extraBody, { foo: 1 })
})

test('credential references are validated, and an empty reference disables auth', () => {
  assert.equal(String(testConfig().apiKeyEnv), 'NANOGPT_API_KEY')
  assert.equal(testConfig({ apiKeyEnv: '' }).apiKeyEnv, undefined)
  assert.throws(() => testConfig({ apiKeyEnv: 'not a ref' }), /not a valid credential reference/)
})
