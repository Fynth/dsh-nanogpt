import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogFixture, fixture } from '../helpers.mjs'
import {
  applyModelOverride,
  mergeModelOverrides,
  normalizeCatalogResponse,
  normalizeEfforts,
  normalizeModel,
  normalizePricing,
  optionalNumber,
} from '../../lib/catalog.js'

test('catalog normalization preserves exact ids and disclosed metadata', () => {
  const { snapshot, models } = catalogFixture()
  assert.equal(snapshot.rawCount, 7)
  assert.equal(snapshot.models.length, 6)
  assert.equal(snapshot.source, 'api')
  const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
  assert.ok(deepseek)
  assert.equal(deepseek.name, 'DeepSeek V4.1 Flash 1017')
  assert.equal(deepseek.contextWindow, 1_048_576)
  assert.equal(deepseek.maxOutputTokens, 393_216)
  assert.deepEqual(deepseek.inputModalities, ['text', 'image'])
  assert.deepEqual(deepseek.reasoningEfforts, ['none', 'low', 'high', 'max'])
  assert.equal(deepseek.toolCalling, true)
  assert.equal(deepseek.vision, true)
  assert.equal(deepseek.subscriptionIncluded, true)
  assert.deepEqual(deepseek.providers, ['deepinfra', 'deepseek', 'baseten'])
  assert.equal(deepseek.source, 'api')
  assert.equal(deepseek.verifiedAt, '2026-10-18T00:00:00.000Z')
})

test('pricing is normalized to USD per million tokens', () => {
  const { models } = catalogFixture()
  const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
  assert.deepEqual(deepseek.pricing, { input: 0.1, output: 0.6, cacheRead: 0.003 })
  const opus = models.find((model) => model.id === 'anthropic/claude-opus-5.5')
  assert.deepEqual(opus.pricing, { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 })
  const kimi = models.find((model) => model.id === 'moonshotai/kimi-k2.6')
  assert.deepEqual(kimi.pricing, { input: 0.43225, output: 1.82 })
  assert.equal(kimi.pricingSource, 'observed')
})

test('missing pricing stays missing, while free pricing stays zero', () => {
  const missing = normalizeModel({ id: 'x/missing' }, '2026-10-18T00:00:00.000Z')
  assert.equal(missing.pricing, undefined)
  const free = normalizeModel(
    { id: 'x/free', pricing: { prompt: 0, completion: 0, currency: 'USD', unit: 'per_million_tokens' } },
    '2026-10-18T00:00:00.000Z',
  )
  assert.deepEqual(free.pricing, { input: 0, output: 0 })
})

test('decision-output models are excluded from the chat catalog', () => {
  const { models } = catalogFixture()
  assert.equal(models.some((model) => model.id === 'openai/gpt-6-luna-decisions'), false)
})

test('unknown modalities and capabilities remain unknown', () => {
  const { models } = catalogFixture()
  const unknown = models.find((model) => model.id === 'acme/unknown-model')
  assert.ok(unknown)
  assert.equal(unknown.inputModalities, undefined)
  assert.equal(unknown.vision, undefined)
  assert.equal(unknown.reasoning, undefined)
  assert.equal(unknown.toolCalling, undefined)
  assert.equal(unknown.pricing, undefined)
})

test('effort normalization drops unknown future values and orders by escalation', () => {
  assert.deepEqual(normalizeEfforts(['max', 'ultra', 'none', 'high']), ['none', 'high', 'max'])
  assert.equal(normalizeEfforts(undefined), undefined)
  assert.deepEqual(normalizeEfforts([]), [])
})

test('deployment overrides merge by exact id and append hand-declared models', () => {
  const { models } = catalogFixture()
  const merged = mergeModelOverrides(models, [
    { id: 'z-ai/glm-5.3', model: 'ignored', name: 'GLM Custom', contextWindow: 999, source: 'user-config' },
    { id: 'brand/new-model', name: 'New Model', reasoningEfforts: ['low', 'high'], defaultEffort: 'high', source: 'user-config' },
  ].map((entry) => {
    const { model: _ignored, ...rest } = entry
    return rest
  }))
  const glm = merged.find((model) => model.id === 'z-ai/glm-5.3')
  assert.equal(glm.name, 'GLM Custom')
  assert.equal(glm.contextWindow, 999)
  assert.equal(glm.source, 'user-config')
  const added = merged.find((model) => model.id === 'brand/new-model')
  assert.ok(added)
  assert.deepEqual(added.reasoningEfforts, ['low', 'high'])
  assert.equal(added.name, 'New Model')
})

test('reasoning-disabled override removes the reasoning ladder', () => {
  const { models } = catalogFixture()
  const glm = models.find((model) => model.id === 'z-ai/glm-5.3')
  const overridden = applyModelOverride(glm, { id: glm.id, reasoningDisabled: true, source: 'user-config' })
  assert.equal(overridden.reasoning, false)
  assert.equal(overridden.reasoningEfforts, undefined)
})
