import { type FetchLike } from './http.js';
import type { CatalogSnapshot, FailureInfo, ProviderCatalog, ProviderRoute } from './shared.js';
/** Shared endpoint-reading dependencies. */
export interface DiscoveryDeps {
    /** Fetch implementation; defaults to the process implementation. */
    fetch?: FetchLike;
    /** App attribution headers. */
    attribution: Record<string, string>;
}
/** One catalog fetch request. */
export interface CatalogFetchRequest {
    baseURL: string;
    apiKey?: string;
    timeoutMs: number;
    signal?: AbortSignal;
}
/**
 * Fetch and normalize the detailed model catalog.
 * @param request - endpoint, optional one-shot credential, timeout and cancellation.
 * @param deps - fetch and attribution.
 * @returns the normalized snapshot.
 */
export declare function fetchCatalog(request: CatalogFetchRequest, deps: DiscoveryDeps): Promise<CatalogSnapshot>;
/** Provider discovery outcome, including a recoverable unsupported status. */
export type ProviderDiscoveryOutcome = {
    status: 'ok';
    catalog: ProviderCatalog;
} | {
    status: 'unsupported';
    message: string;
} | {
    status: 'error';
    failure: FailureInfo;
};
/** Normalize one provider row. */
export declare function normalizeProviderRoute(raw: Record<string, unknown>): ProviderRoute | undefined;
/** Read one provider-discovery answer. */
export declare function fetchProviderCatalog(origin: string, modelId: string, deps: DiscoveryDeps, options: {
    apiKey?: string;
    timeoutMs: number;
    signal?: AbortSignal;
}): Promise<ProviderDiscoveryOutcome>;
/** Connection-test status categories shown by the settings page. */
export type ConnectionStatus = 'connected' | 'invalid-key' | 'rate-limited' | 'insufficient-funds' | 'provider-unavailable' | 'timeout' | 'network' | 'invalid-endpoint' | 'unsupported' | 'unknown-failure';
/** Result of one authenticated connection test. */
export interface ConnectionTestResult {
    status: ConnectionStatus;
    /** Whether the credential was proven valid by an authenticated endpoint. */
    authenticated: boolean;
    /** Human-readable, actionable summary. */
    message: string;
    /** Endpoint that answered. */
    endpoint?: string;
    /** Round-trip time. */
    latencyMs: number;
    /** HTTP status when one was received. */
    httpStatus?: number;
    /** Whether the public catalog was reachable (never used as auth proof). */
    catalogReachable?: boolean;
    /** Balance when the authenticated endpoint disclosed it. */
    balanceUsd?: number;
    /** Provider request id when available. */
    requestId?: string;
}
/**
 * Prove or disprove authentication with an authenticated, non-inference read.
 *
 * Order: `POST /api/check-balance` (documented account read, no model tokens),
 * then `GET /api/v1/usage` (documented authenticated aggregate) when the
 * balance path is absent. A public catalog read is attempted separately and is
 * never used to claim authentication.
 *
 * @param request - endpoint, credential, timeout, cancellation.
 * @param deps - fetch and attribution.
 * @returns categorized result for the UI.
 */
export declare function testConnection(request: {
    baseURL: string;
    origin: string;
    apiKey?: string;
    timeoutMs: number;
    signal?: AbortSignal;
}, deps: DiscoveryDeps): Promise<ConnectionTestResult>;
/** Probe the public catalog without using it as authentication evidence. */
export declare function probeCatalog(baseURL: string, deps: DiscoveryDeps, options?: {
    timeoutMs: number;
    signal?: AbortSignal;
}): Promise<{
    reachable: boolean;
    models?: number;
    failure?: FailureInfo;
}>;
