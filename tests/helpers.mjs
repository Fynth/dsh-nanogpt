/**
 * Shared test helpers. No production code imports this file.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { normalizeCatalogResponse } from '../lib/catalog.js'
import { resolveConfig } from '../lib/config.js'
import { defaultPreferences } from '../lib/preferences.js'
import { resolveReasoning } from '../lib/reasoning.js'

const here = dirname(fileURLToPath(import.meta.url))

/** Load one JSON fixture. */
export function fixture(name) {
  return JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'))
}

/** Normalized catalog from the representative fixture. */
export function catalogFixture() {
  const body = fixture('models-detailed.json')
  return normalizeCatalogResponse(
    body,
    'https://api.nano-gpt.com/api/v1/models?detailed=true',
    '2026-10-18T00:00:00.000Z',
  )
}

/** Resolved configuration with test-safe defaults. */
export function testConfig(overrides = {}) {
  return resolveConfig({
    apiKeyEnv: 'NANOGPT_API_KEY',
    baseURL: 'https://api.nano-gpt.com/api/v1',
    ...overrides,
  })
}

/** Default preferences with shallow overrides. */
export function testPreferences(overrides = {}) {
  return { ...defaultPreferences('2026-10-18T00:00:00.000Z'), ...overrides }
}

/** Build a protocol context from a fixture model. */
export function protocolContext({ model, config, preferences, options, selection, visibility = 'show', policy }) {
  const effectivePolicy = policy === undefined ? resolveReasoning({ model }) : policy
  return {
    config,
    preferences,
    model,
    policy: effectivePolicy,
    selection,
    visibility,
    options,
    resolveFileText: (ref) => `[file ${ref.name}]`,
    resolveImage: async () => undefined,
  }
}

/** Build a ReadableStream from a string, in fixed byte slices. */
export function sseStream(text, chunkSize = 17) {
  const bytes = new TextEncoder().encode(text)
  let offset = 0
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) {
        controller.close()
        return
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize))
      offset += chunkSize
    },
  })
}

/** Collect one async chunk iterable. */
export async function collect(iterable) {
  const result = []
  for await (const chunk of iterable) result.push(chunk)
  return result
}

/** One successful JSON response. */
export function jsonResponse(value, init = {}) {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
    ...init,
  })
}

/** One SSE response. */
export function streamResponse(text, init = {}) {
  return new Response(sseStream(text), {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream', ...(init.headers ?? {}) },
    ...init,
  })
}

/** One error response with a NanoGPT/OpenAI-shaped body. */
export function errorResponse(status, body, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  })
}

/** Mock fetch that matches URL substrings in insertion order. */
export function mockFetch(routes) {
  const calls = []
  const fetchImpl = async (url, init) => {
    const stringUrl = String(url)
    calls.push({ url: stringUrl, init })
    for (const [match, handler] of routes) {
      if (stringUrl.includes(match)) {
        if (typeof handler === 'function') return handler(stringUrl, init)
        return handler
      }
    }
    throw new Error(`unexpected fetch: ${stringUrl}`)
  }
  return { fetch: fetchImpl, calls }
}
