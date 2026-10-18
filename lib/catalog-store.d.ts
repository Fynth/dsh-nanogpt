import { type DiscoveryDeps } from './discovery.js';
import { type ResolvedConfig } from './config.js';
import type { CatalogModel, CatalogSnapshot, CatalogStatus, FailureInfo } from './shared.js';
/** Minimal logger surface used here; DSH's logger satisfies it. */
export interface CatalogLogger {
    info(message: string): void;
    warn(message: string): void;
}
/** One refresh outcome. */
export interface RefreshResult {
    /** Whether the refresh actually fetched and replaced the snapshot. */
    refreshed: boolean;
    /** Whether the normalized content hash changed. */
    changed: boolean;
    /** Models in the current snapshot. */
    models: number;
    /** Refresh failure, when one occurred. */
    failure?: FailureInfo;
    /** Cache write outcome. */
    cacheWritten: boolean;
    /** Cache write error, when writing failed. */
    cacheError?: string;
}
/** Construction options. */
export interface CatalogManagerOptions {
    /** Current validated configuration. */
    config: () => ResolvedConfig;
    /** Resolve the configured credential for one catalog read. */
    resolveApiKey: (config: ResolvedConfig) => Promise<string | undefined>;
    /** Fetch and attribution. */
    deps: DiscoveryDeps;
    /** Logger for refresh outcomes. */
    logger: CatalogLogger;
    /** Called after every completed attempt with the current snapshot state. */
    onChange?: (snapshot: CatalogSnapshot | undefined, result: RefreshResult) => void;
    /** Cache file path override, for tests. */
    cachePath?: string;
    /** Clock override, for tests. */
    now?: () => number;
}
/** Default cache path under the harness cache directory. */
export declare function defaultCatalogCachePath(): string;
/** Validate one cache document. */
export declare function validateCacheDocument(value: unknown, endpoint: string): CatalogSnapshot | undefined;
/** The live catalog manager. */
export declare class CatalogManager {
    private snapshot;
    private error;
    private refreshing;
    private activeController;
    private readonly options;
    private readonly cachePath;
    private readonly now;
    private disposed;
    /** @param options - live resolution and cache settings. */
    constructor(options: CatalogManagerOptions);
    /** Current snapshot, when one is loaded. */
    current(): CatalogSnapshot | undefined;
    /** Current model list; empty before the first successful cache/fetch. */
    models(): readonly CatalogModel[];
    /** Load the disk cache for the configured endpoint. */
    loadCache(): Promise<boolean>;
    /** Whether the current snapshot is older than the freshness window. */
    stale(): boolean;
    /** Report the current state for the settings UI. */
    status(): CatalogStatus;
    /** Persist the snapshot atomically. */
    private writeCache;
    /**
     * Refresh the catalog, sharing one attempt across concurrent callers.
     * @param reason - `mount`, `interval`, `manual` or `models-page`.
     * @param options - caller cancellation.
     * @returns the refresh outcome.
     */
    refresh(reason: string, options?: {
        signal?: AbortSignal;
    }): Promise<RefreshResult>;
    /** One refresh attempt. */
    private runRefresh;
    /** Stop future refreshes and abort any in-flight network attempt. */
    dispose(): void;
}
