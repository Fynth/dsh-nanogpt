/**
 * The authenticated, browser-facing RPC channel for Settings → NanoGPT.
 *
 * The browser never receives an API key, a raw request body from a real
 * session, or a deployment secret. Every credentialed read happens here, every
 * write targets the reference the host configuration names, and the request
 * preview uses the same serializer as real traffic with a synthetic prompt.
 *
 * @module dsh-nanogpt/rpc
 */
import { type CredentialProvider, type CredentialRef } from '@deepseek-ai/dsh-credentials';
import type { NanoGptAdapter } from './adapter.js';
import type { CatalogManager } from './catalog-store.js';
import { type DiscoveryDeps } from './discovery.js';
import type { ResolvedConfig } from './config.js';
import { type Preferences, type PreferencesStore } from './preferences.js';
import type { CatalogStatus, RequestDiagnostic } from './shared.js';
/** Channel the browser half registers and calls under. */
export declare const RPC_CHANNEL = "/nanogpt";
/** Endpoint names. */
export declare const RPC_ENDPOINTS: {
    readonly status: "status";
    readonly catalogStatus: "catalog/status";
    readonly catalogRefresh: "catalog/refresh";
    readonly credentialStatus: "credential/status";
    readonly credentialSet: "credential/set";
    readonly credentialRemove: "credential/remove";
    readonly connectionTest: "connection/test";
    readonly modelsQuery: "models/query";
    readonly modelsGet: "models/get";
    readonly modelsProviders: "models/providers";
    readonly preferencesGet: "preferences/get";
    readonly preferencesUpdate: "preferences/update";
    readonly preferencesExport: "preferences/export";
    readonly preferencesImport: "preferences/import";
    readonly defaultSet: "default/set";
    readonly usageRead: "usage/read";
    readonly diagnosticsList: "diagnostics/list";
    readonly diagnosticsClear: "diagnostics/clear";
    readonly requestPreview: "request/preview";
};
/** One success envelope. */
export interface RpcSuccess<T> {
    ok: true;
    value: T;
}
/** One failure envelope. */
export interface RpcFailure {
    ok: false;
    error: {
        code: string;
        message: string;
        details: Record<string, unknown>;
    };
}
/** One reply. */
export type RpcReply<T> = RpcSuccess<T> | RpcFailure;
/** Handler signature the connection service calls. */
export type NanoGptRpcHandler = (endpoint: string, payload: unknown, signal: AbortSignal) => Promise<RpcReply<unknown>>;
/** One detached DSH agent-default selection. */
export interface AgentDefaultSelection {
    provider: string;
    model: string;
    reasoningEffort?: string;
}
/** Narrow view of DSH's `ctx.agentDefaultModel` service. */
export interface AgentDefaultModelLike {
    currentSelection(): AgentDefaultSelection;
    saveSelection(selection: AgentDefaultSelection): Promise<void>;
}
/** Everything the RPC handler reads. */
export interface NanoGptRpcOptions {
    config: () => ResolvedConfig;
    catalog: () => CatalogManager;
    preferences: () => Preferences;
    store: PreferencesStore;
    adapter: NanoGptAdapter;
    resolveCredential: (ref: CredentialRef) => Promise<string | undefined>;
    credentials: () => CredentialProvider | undefined;
    discovery: DiscoveryDeps;
    logger: {
        warn(message: string): void;
    };
    /** DSH's live default-model service, when the profile mounts it. */
    agentDefaultModel?: () => AgentDefaultModelLike | undefined;
    /** Invalidate resident model selectors after a preference-visible write. */
    onPreferencesChanged?: () => void;
}
/** Read the live DSH default-model selection without exposing unrelated config. */
export declare function agentDefaultView(options: NanoGptRpcOptions): Record<string, unknown>;
/**
 * Build the RPC handler.
 * @param options - live readers, adapter, store, credentials, and discovery.
 * @returns the handler to register on `connection.rpc.handle`.
 */
export declare function createNanoGptRpcHandler(options: NanoGptRpcOptions): NanoGptRpcHandler;
/** Shape returned by the diagnostics endpoint. */
export interface DiagnosticsValue {
    entries: RequestDiagnostic[];
    limit: number;
}
/** Shape returned by catalog status. */
export interface CatalogStatusValue {
    catalog: CatalogStatus;
}
