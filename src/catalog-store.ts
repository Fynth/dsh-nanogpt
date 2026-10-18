/**
 * Live catalog manager: cache, stale-while-revalidate refresh, and change
 * detection.
 *
 * A successful refresh replaces the snapshot atomically; a failed refresh
 * leaves the last good snapshot serving and records the failure beside it.
 * Concurrent refresh requests share one network attempt. The disk cache lives
 * outside the installed package so updating the plugin keeps the last known
 * catalog for offline boot.
 *
 * @module dsh-nanogpt/catalog-store
 */
import { readFile } from 'node:fs/promises'
import { writeFileAtomic } from '@deepseek-ai/dsh-atomic-write'
import { dshCachePath } from '@deepseek-ai/dsh-home-paths'
import { fetchCatalog, type DiscoveryDeps } from './discovery.js'
import { modelsEndpoint, type ResolvedConfig } from './config.js'
import { isRecord, optionalString } from './catalog.js'
import type { CatalogModel, CatalogSnapshot, CatalogStatus, FailureInfo } from './shared.js'

/** Minimal logger surface used here; DSH's logger satisfies it. */
export interface CatalogLogger {
  info(message: string): void
  warn(message: string): void
}

/** One refresh outcome. */
export interface RefreshResult {
  /** Whether the refresh actually fetched and replaced the snapshot. */
  refreshed: boolean
  /** Whether the normalized content hash changed. */
  changed: boolean
  /** Models in the current snapshot. */
  models: number
  /** Refresh failure, when one occurred. */
  failure?: FailureInfo
  /** Cache write outcome. */
  cacheWritten: boolean
  /** Cache write error, when writing failed. */
  cacheError?: string
}

/** Construction options. */
export interface CatalogManagerOptions {
  /** Current validated configuration. */
  config: () => ResolvedConfig
  /** Resolve the configured credential for one catalog read. */
  resolveApiKey: (config: ResolvedConfig) => Promise<string | undefined>
  /** Fetch and attribution. */
  deps: DiscoveryDeps
  /** Logger for refresh outcomes. */
  logger: CatalogLogger
  /** Called after every completed attempt with the current snapshot state. */
  onChange?: (snapshot: CatalogSnapshot | undefined, result: RefreshResult) => void
  /** Cache file path override, for tests. */
  cachePath?: string
  /** Clock override, for tests. */
  now?: () => number
}

/** Cache document envelope. */
interface CacheDocument {
  version: 1
  endpoint: string
  fetchedAt: string
  hash: string
  rawCount: number
  models: CatalogModel[]
}

/** Default cache path under the harness cache directory. */
export function defaultCatalogCachePath(): string {
  return dshCachePath('dsh-nanogpt', 'catalog.json')
}

/** Validate one cache document. */
export function validateCacheDocument(value: unknown, endpoint: string): CatalogSnapshot | undefined {
  if (!isRecord(value)) return undefined
  if (value.version !== 1) return undefined
  if (optionalString(value.endpoint) !== endpoint) return undefined
  const fetchedAt = optionalString(value.fetchedAt)
  const hash = optionalString(value.hash)
  if (fetchedAt === undefined || hash === undefined || Number.isNaN(Date.parse(fetchedAt))) return undefined
  if (!Array.isArray(value.models)) return undefined
  const models: CatalogModel[] = []
  for (const raw of value.models) {
    if (!isRecord(raw)) return undefined
    const id = optionalString(raw.id)
    const name = optionalString(raw.name)
    if (id === undefined || name === undefined) return undefined
    models.push(raw as unknown as CatalogModel)
  }
  return {
    version: 1,
    endpoint,
    fetchedAt,
    source: 'cache',
    models,
    rawCount: typeof value.rawCount === 'number' && Number.isFinite(value.rawCount) ? value.rawCount : models.length,
    hash,
  }
}

/** The live catalog manager. */
export class CatalogManager {
  private snapshot: CatalogSnapshot | undefined
  private error: { code: string; message: string; at: string } | undefined
  private refreshing: Promise<RefreshResult> | undefined
  private activeController: AbortController | undefined
  private readonly options: CatalogManagerOptions
  private readonly cachePath: string
  private readonly now: () => number
  private disposed = false

  /** @param options - live resolution and cache settings. */
  constructor(options: CatalogManagerOptions) {
    this.options = options
    this.cachePath = options.cachePath ?? defaultCatalogCachePath()
    this.now = options.now ?? Date.now
  }

  /** Current snapshot, when one is loaded. */
  current(): CatalogSnapshot | undefined {
    return this.snapshot
  }

  /** Current model list; empty before the first successful cache/fetch. */
  models(): readonly CatalogModel[] {
    return this.snapshot?.models ?? []
  }

  /** Load the disk cache for the configured endpoint. */
  async loadCache(): Promise<boolean> {
    if (this.disposed) return false
    let text: string
    try {
      text = await readFile(this.cachePath, 'utf8')
    } catch {
      return false
    }
    if (text.length > 64 * 1024 * 1024) {
      this.options.logger.warn('llm-nanogpt: catalog cache is too large; ignoring it')
      return false
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      this.options.logger.warn('llm-nanogpt: catalog cache is malformed JSON; ignoring it')
      return false
    }
    const endpoint = modelsEndpoint(this.options.config().baseURL)
    const snapshot = validateCacheDocument(parsed, endpoint)
    if (snapshot === undefined) {
      this.options.logger.warn('llm-nanogpt: catalog cache does not match the configured endpoint or version; ignoring it')
      return false
    }
    this.snapshot = snapshot
    return true
  }

  /** Whether the current snapshot is older than the freshness window. */
  stale(): boolean {
    if (this.snapshot === undefined) return true
    const age = this.now() - Date.parse(this.snapshot.fetchedAt)
    const config = this.options.config()
    const windowMs = Math.max(config.refreshMinutes, 60) * 60_000
    return !Number.isFinite(age) || age > Math.max(windowMs * 2, 86_400_000)
  }

  /** Report the current state for the settings UI. */
  status(): CatalogStatus {
    const config = this.options.config()
    const snapshot = this.snapshot
    const refreshing = this.refreshing !== undefined
    if (snapshot === undefined) {
      return {
        status: this.error !== undefined ? 'error' : refreshing ? 'loading' : 'empty',
        stale: true,
        chatModels: 0,
        rawModels: 0,
        refreshing,
        ...this.error === undefined ? {} : { error: this.error },
      }
    }
    const age = this.now() - Date.parse(snapshot.fetchedAt)
    return {
      status: 'ready',
      source: snapshot.source,
      endpoint: snapshot.endpoint,
      fetchedAt: snapshot.fetchedAt,
      ageMs: Number.isFinite(age) ? age : undefined,
      stale: this.stale(),
      chatModels: snapshot.models.length,
      rawModels: snapshot.rawCount,
      refreshing,
      ...this.error === undefined ? {} : { error: this.error },
    }
  }

  /** Persist the snapshot atomically. */
  private async writeCache(snapshot: CatalogSnapshot): Promise<{ ok: boolean; error?: string }> {
    const document: CacheDocument = {
      version: 1,
      endpoint: snapshot.endpoint,
      fetchedAt: snapshot.fetchedAt,
      hash: snapshot.hash,
      rawCount: snapshot.rawCount,
      models: [...snapshot.models],
    }
    try {
      await writeFileAtomic(this.cachePath, `${JSON.stringify(document)}\n`, { mode: 0o600, dirMode: 0o700 })
      return { ok: true }
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : 'cache write failed' }
    }
  }

  /**
   * Refresh the catalog, sharing one attempt across concurrent callers.
   * @param reason - `mount`, `interval`, `manual` or `models-page`.
   * @param options - caller cancellation.
   * @returns the refresh outcome.
   */
  async refresh(reason: string, options: { signal?: AbortSignal } = {}): Promise<RefreshResult> {
    if (this.disposed) return { refreshed: false, changed: false, models: this.models().length, cacheWritten: false, failure: { code: 'DISPOSED', message: 'catalog manager is disposed' } }
    if (this.refreshing !== undefined) return this.refreshing
    const attempt = this.runRefresh(reason, options.signal)
    this.refreshing = attempt
    try {
      return await attempt
    } finally {
      this.refreshing = undefined
    }
  }

  /** One refresh attempt. */
  private async runRefresh(reason: string, signal?: AbortSignal): Promise<RefreshResult> {
    const previous = this.snapshot
    const config = this.options.config()
    const controller = new AbortController()
    this.activeController = controller
    const onAbort = (): void => controller.abort(signal?.reason)
    if (signal !== undefined) {
      if (signal.aborted) controller.abort(signal.reason)
      else signal.addEventListener('abort', onAbort, { once: true })
    }
    try {
      const apiKey = await this.options.resolveApiKey(config)
      if (controller.signal.aborted) {
        return { refreshed: false, changed: false, models: previous?.models.length ?? 0, cacheWritten: false, failure: { code: 'ABORTED', message: 'catalog refresh cancelled' } }
      }
      const snapshot = await fetchCatalog(
        {
          baseURL: config.baseURL,
          ...apiKey === undefined ? {} : { apiKey },
          timeoutMs: config.requestTimeoutMs,
          signal: controller.signal,
        },
        this.options.deps,
      )
      if (this.disposed) return { refreshed: false, changed: false, models: previous?.models.length ?? 0, cacheWritten: false }
      const changed = previous === undefined || previous.hash !== snapshot.hash
      this.snapshot = snapshot
      this.error = undefined
      const cache = await this.writeCache(snapshot)
      const result: RefreshResult = {
        refreshed: true,
        changed,
        models: snapshot.models.length,
        cacheWritten: cache.ok,
        ...cache.ok ? {} : { cacheError: cache.error },
      }
      this.options.logger.info(
        `llm-nanogpt: ${reason} catalog refresh: ${snapshot.models.length} chat models from ${snapshot.endpoint}${changed ? ' (changed)' : ' (unchanged)'}${cache.ok ? '' : `; cache not written (${cache.error})`}`,
      )
      this.options.onChange?.(snapshot, result)
      return result
    } catch (error) {
      const failure: FailureInfo = {
        code: typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'TRANSPORT',
        message: error instanceof Error ? error.message : 'catalog refresh failed',
        ...typeof error === 'object' && error !== null && 'failure' in error && isRecord(error.failure) && typeof error.failure.status === 'number'
          ? { status: error.failure.status }
          : {},
      }
      if (controller.signal.aborted) {
        return { refreshed: false, changed: false, models: previous?.models.length ?? 0, cacheWritten: false, failure: { code: 'ABORTED', message: 'catalog refresh cancelled' } }
      }
      this.error = { ...failure, at: new Date().toISOString() }
      const result: RefreshResult = { refreshed: false, changed: false, models: previous?.models.length ?? 0, cacheWritten: false, failure }
      this.options.logger.warn(`llm-nanogpt: ${reason} catalog refresh failed; the last good catalog (if any) keeps serving`)
      this.options.logger.warn(failure.message)
      this.options.onChange?.(this.snapshot, result)
      return result
    } finally {
      signal?.removeEventListener('abort', onAbort)
      if (this.activeController === controller) this.activeController = undefined
    }
  }

  /** Stop future refreshes and abort any in-flight network attempt. */
  dispose(): void {
    this.disposed = true
    this.activeController?.abort(new Error('catalog manager disposed'))
    this.activeController = undefined
  }
}
