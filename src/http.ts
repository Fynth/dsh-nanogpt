/**
 * Small, security-conscious HTTP helpers shared by catalog, usage, and the
 * chat transports.
 *
 * Credentials are sent only in headers (never URLs), redirects fail closed so
 * the bearer token cannot travel to another origin, every request has a
 * bounded response body, and every attempt accepts caller cancellation.
 *
 * @module dsh-nanogpt/http
 */
import { LlmError } from '@deepseek-ai/dsh-llm'
import { httpFailure } from './errors.js'

/** Fetch implementation; injectable for tests. */
export type FetchLike = typeof fetch

/** One JSON request. */
export interface JsonRequest {
  url: string
  method?: 'GET' | 'POST' | 'PATCH'
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
  timeoutMs?: number
  maxBytes?: number
  fetch?: FetchLike
}

/** One decoded JSON answer with the response facts callers need. */
export interface JsonResponse {
  status: number
  headers: Headers
  body: unknown
  text: string
  bytes: number
}

/** Build a combined signal that aborts on caller cancellation or the attempt deadline. */
export function attemptSignal(signal: AbortSignal | undefined, timeoutMs: number): { signal: AbortSignal; dispose: () => void } {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error(`attempt timed out after ${timeoutMs} ms`)), timeoutMs)
  timer.unref?.()
  const listener = (): void => controller.abort(signal?.reason)
  if (signal !== undefined) {
    if (signal.aborted) controller.abort(signal.reason)
    else signal.addEventListener('abort', listener, { once: true })
  }
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', listener)
    },
  }
}

/** Read a response body with a hard byte cap. */
export async function readBodyBounded(response: Response, maxBytes: number): Promise<{ text: string; bytes: number }> {
  const contentLength = Number(response.headers.get('content-length') ?? '')
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new LlmError(`NanoGPT response is larger than the ${maxBytes}-byte limit`, 'MALFORMED_RESPONSE')
  }
  if (response.body === null) return { text: '', bytes: 0 }
  const reader = response.body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      bytes += result.value.byteLength
      if (bytes > maxBytes) {
        throw new LlmError(`NanoGPT response is larger than the ${maxBytes}-byte limit`, 'MALFORMED_RESPONSE')
      }
      text += decoder.decode(result.value, { stream: true })
    }
    text += decoder.decode()
  } finally {
    try {
      await reader.cancel()
    } catch {
      // Already closed.
    }
    reader.releaseLock()
  }
  return { text, bytes }
}

/**
 * Perform one bounded JSON request.
 * @param request - URL, method, headers, body, cancellation and limits.
 * @returns decoded status, headers, and body.
 * @throws LlmError classified for transport, timeout, or non-2xx HTTP failures.
 */
export async function requestJson(request: JsonRequest): Promise<JsonResponse> {
  const timeoutMs = request.timeoutMs ?? 30_000
  const maxBytes = request.maxBytes ?? 8 * 1024 * 1024
  const attempt = attemptSignal(request.signal, timeoutMs)
  try {
    const response = await (request.fetch ?? fetch)(request.url, {
      method: request.method ?? 'GET',
      headers: request.headers,
      ...request.body === undefined ? {} : { body: request.body },
      redirect: 'error',
      signal: attempt.signal,
    })
    const { text, bytes } = await readBodyBounded(response, maxBytes)
    let body: unknown
    if (text.trim().length === 0) body = undefined
    else {
      try {
        body = JSON.parse(text)
      } catch {
        body = undefined
      }
    }
    if (!response.ok) {
      // Reuse the provider-neutral classifier: it keeps 402 as QUOTA, 429 as
      // RATE_LIMIT, 5xx as SERVER, and preserves Retry-After/request-id facts.
      throw httpFailure(response.status, body, response.headers, 'account or discovery request')
    }
    return { status: response.status, headers: response.headers, body, text, bytes }
  } catch (error) {
    if (error instanceof LlmError) throw error
    if (request.signal?.aborted === true) throw new LlmError('NanoGPT request was cancelled', 'ABORTED', { cause: error })
    const message = error instanceof Error ? error.message : String(error)
    throw new LlmError(
      /timeout|timed out/i.test(message) ? `NanoGPT request timed out: ${message}` : `NanoGPT transport failure: ${message}`,
      /timeout|timed out/i.test(message) ? 'TIMEOUT' : 'TRANSPORT',
      { cause: error },
    )
  } finally {
    attempt.dispose()
  }
}

/** Standard authentication/attribution headers for one authenticated request. */
export function authenticatedHeaders(apiKey: string | undefined, attribution: Record<string, string>): Record<string, string> {
  return {
    ...attribution,
    Accept: 'application/json',
    ...apiKey === undefined ? {} : { Authorization: `Bearer ${apiKey}` },
  }
}

/**
 * Account-endpoint headers. The public API document advertises both a bearer
 * scheme and an `x-api-key` scheme; account endpoints are documented with the
 * latter in places, so send both forms rather than reporting a valid key as
 * invalid because one carrier was absent. The key still travels only to the
 * configured NanoGPT origin.
 */
export function accountHeaders(apiKey: string | undefined, attribution: Record<string, string>): Record<string, string> {
  return {
    ...authenticatedHeaders(apiKey, attribution),
    ...apiKey === undefined ? {} : { 'x-api-key': apiKey },
  }
}

/** Standard headers for a streaming JSON request. */
export function streamingHeaders(apiKey: string | undefined, attribution: Record<string, string>): Record<string, string> {
  return {
    ...attribution,
    Accept: 'text/event-stream',
    'Content-Type': 'application/json',
    ...apiKey === undefined ? {} : { Authorization: `Bearer ${apiKey}` },
  }
}

/** Read an HTTP-date/Retry-After value from one response, without throwing. */
export function retryAfterMs(headers: Headers): number | undefined {
  const raw = headers.get('retry-after')
  if (raw === null) return undefined
  const seconds = Number(raw)
  if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1_000)
  const date = Date.parse(raw)
  if (Number.isFinite(date)) return Math.max(0, date - Date.now())
  return undefined
}
