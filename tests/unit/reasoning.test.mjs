import test from 'node:test'
import assert from 'node:assert/strict'
import { catalogFixture } from '../helpers.mjs'
import { resolveReasoning, wireReasoning, UnsupportedEffortError } from '../../lib/reasoning.js'

const { models } = catalogFixture()
const deepseek = models.find((model) => model.id === 'deepseek/deepseek-v4.1-flash-1017')
const opus = models.find((model) => model.id === 'anthropic/claude-opus-5.5')
const gpt = models.find((model) => model.id === 'openai/gpt-5.5')
const glm = models.find((model) => model.id === 'z-ai/glm-5.3')
const kimi = models.find((model) => model.id === 'moonshotai/kimi-k2.6')

test('API reasoning ladder is authoritative and ordered', () => {
  const policy = resolveReasoning({ model: deepseek })
  assert.deepEqual(policy.efforts, ['none', 'low', 'high', 'max'])
  assert.equal(policy.source, 'api')
  assert.equal(policy.supportsDisable, true)
  assert.equal(policy.alwaysThinking, false)
  assert.equal(policy.defaultEffort, undefined)
})

test('non-reasoning catalog models expose no reasoning metadata', () => {
  assert.equal(resolveReasoning({ model: kimi }), undefined)
})

test('always-thinking models cannot be disabled', () => {
  const policy = resolveReasoning({ model: opus })
  assert.deepEqual(policy.efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(policy.alwaysThinking, true)
  assert.equal(policy.supportsDisable, false)
  assert.equal(policy.defaultEffort, 'high')
  assert.throws(() => wireReasoning('chat', 'none', policy, 'show', opus.id), UnsupportedEffortError)
  assert.throws(() => wireReasoning('messages', 'off', policy, 'show', opus.id), UnsupportedEffortError)
})

test('xhigh and max remain distinct through every protocol', () => {
  const policy = resolveReasoning({ model: gpt })
  assert.deepEqual(policy.efforts, ['none', 'low', 'medium', 'high', 'xhigh'])
  const xhighChat = wireReasoning('chat', 'xhigh', policy, 'show', gpt.id)
  assert.equal(xhighChat.fields.reasoning_effort, 'xhigh')
  const maxPolicy = resolveReasoning({ model: opus })
  const maxChat = wireReasoning('chat', 'max', maxPolicy, 'show', opus.id)
  assert.equal(maxChat.fields.reasoning_effort, 'max')
  assert.notEqual(maxChat.fields.reasoning_effort, 'xhigh')
  assert.deepEqual(wireReasoning('messages', 'max', maxPolicy, 'show', opus.id).fields, { output_config: { effort: 'max' } })
  assert.deepEqual(wireReasoning('responses', 'max', maxPolicy, 'show', opus.id).fields, { reasoning: { effort: 'max' } })
})

test('minimal is sent through body fields, not a model suffix', () => {
  const policy = { efforts: ['minimal', 'low'], source: 'api', alwaysThinking: false, supportsDisable: false, unknown: false, experimental: false, unverifiedLevels: [] }
  assert.deepEqual(wireReasoning('chat', 'minimal', policy, 'show', 'm').fields, { reasoning_effort: 'minimal' })
  assert.deepEqual(wireReasoning('messages', 'minimal', policy, 'show', 'm').fields, { output_config: { effort: 'minimal' } })
})

test('auto omits the effort while visibility can still hide output', () => {
  const policy = resolveReasoning({ model: deepseek })
  assert.deepEqual(wireReasoning('chat', undefined, policy, 'show', deepseek.id).fields, {})
  assert.deepEqual(wireReasoning('chat', 'auto', policy, 'show', deepseek.id).fields, {})
  assert.deepEqual(wireReasoning('chat', undefined, policy, 'hide', deepseek.id).fields, { reasoning: { exclude: true } })
  assert.deepEqual(wireReasoning('responses', undefined, policy, 'hide', deepseek.id).fields, { reasoning: { exclude: true } })
})

test('chat and responses hide reasoning, and messages uses the documented suffix', () => {
  const policy = resolveReasoning({ model: deepseek })
  assert.deepEqual(wireReasoning('chat', 'high', policy, 'hide', deepseek.id).fields, { reasoning_effort: 'high', reasoning: { exclude: true } })
  assert.deepEqual(wireReasoning('responses', 'high', policy, 'hide', deepseek.id).fields, { reasoning: { effort: 'high', exclude: true } })
  const messages = wireReasoning('messages', 'high', policy, 'hide', deepseek.id)
  assert.deepEqual(messages.fields, { output_config: { effort: 'high' } })
  assert.equal(messages.exclude, false)
})

test('messages none uses thinking disabled rather than output_config none', () => {
  const policy = resolveReasoning({ model: deepseek })
  assert.deepEqual(wireReasoning('messages', 'none', policy, 'show', deepseek.id).fields, { thinking: { type: 'disabled' } })
  const fields = wireReasoning('messages', 'none', policy, 'show', deepseek.id).fields
  assert.equal('output_config' in fields, false)
})

test('legacy off maps to none only where none is supported', () => {
  const policy = resolveReasoning({ model: deepseek })
  assert.deepEqual(wireReasoning('chat', 'off', policy, 'show', deepseek.id).fields, { reasoning_effort: 'none' })
  assert.throws(() => wireReasoning('chat', 'off', resolveReasoning({ model: glm }), 'show', glm.id), UnsupportedEffortError)
})

test('pinned provider facts narrow the model-wide ladder', () => {
  const policy = resolveReasoning({
    model: deepseek,
    route: { provider: 'deepinfra', efforts: ['none', 'low', 'high'], alwaysThinking: false },
  })
  assert.deepEqual(policy.efforts, ['none', 'low', 'high'])
  assert.equal(policy.source, 'api-route')
  assert.equal(policy.route, 'deepinfra')
  assert.ok(policy.notes.some((note) => note.includes('differs from the model-wide catalog')))
})

test('provider always-on removes none even when the catalog listed it', () => {
  const policy = resolveReasoning({
    model: deepseek,
    route: { provider: 'x', efforts: ['none', 'low', 'high'], alwaysThinking: true },
  })
  assert.deepEqual(policy.efforts, ['low', 'high'])
  assert.equal(policy.alwaysThinking, true)
  assert.equal(policy.supportsDisable, false)
})

test('unknown reasoning ladder offers only provider default unless experimental', () => {
  const unknown = { ...deepseek, reasoningEfforts: undefined, reasoning: true }
  const conservative = resolveReasoning({ model: unknown })
  assert.deepEqual(conservative.efforts, [])
  assert.equal(conservative.unknown, true)
  const experimental = resolveReasoning({ model: unknown, experimental: true })
  assert.deepEqual(experimental.efforts, ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(experimental.source, 'inferred')
  assert.equal(experimental.experimental, true)
  assert.equal(experimental.unverifiedLevels.length, 7)
})

test('user override widens the ladder and marks every unverified level', () => {
  const policy = resolveReasoning({
    model: glm,
    override: { efforts: ['low', 'medium', 'high', 'xhigh', 'max'], source: 'user-config' },
  })
  assert.deepEqual(policy.efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.deepEqual(policy.unverifiedLevels, ['medium', 'xhigh'])
  assert.equal(policy.source, 'user-config')
})

test('documented policy is used only when the catalog is silent', () => {
  const silentOpus = { ...opus, reasoningEfforts: undefined }
  const policy = resolveReasoning({ model: silentOpus })
  assert.equal(policy.source, 'documentation')
  assert.deepEqual(policy.efforts, ['low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(policy.defaultEffort, 'high')
  assert.ok(policy.notes.length > 0)
})

test('unsupported configured default is ignored instead of clamped', () => {
  const policy = resolveReasoning({ model: deepseek, configuredDefault: 'xhigh' })
  assert.equal(policy.defaultEffort, undefined)
  assert.ok(policy.notes.some((note) => note.includes('xhigh')))
})

test('model default wins when supported', () => {
  const policy = resolveReasoning({ model: deepseek, configuredDefault: 'low', modelDefault: 'max' })
  assert.equal(policy.defaultEffort, 'max')
})

test('reasoning-disabled override removes the policy', () => {
  assert.equal(resolveReasoning({ model: deepseek, override: { disabled: true } }), undefined)
})
