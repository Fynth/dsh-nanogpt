/**
 * The `nanogpt` LLM adapter.
 *
 * One adapter instance owns one provider route. Every operation captures one
 * generation of configuration, preferences, and catalog state before its first
 * `await`, so a settings change or catalog refresh cannot combine one
 * generation's capabilities with another generation's endpoint mid-request.
 *
 * Chat runs through the three documented NanoGPT protocols; reasoning
 * capability is resolved per exact model (and per pinned route when one is
 * selected), and only the selected protocol's fields are serialized.
 *
 * @module dsh-nanogpt/adapter
 */
import { LlmAdapter, type GenerateOptions, type LlmModelInfo, type LlmProviderInfo, type LlmResolvedModelInfo, type PreparedAdapterCall, type ResolvedRetryPolicy, type StreamChunk } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore, FileAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { CatalogManager } from './catalog-store.js';
import { type ResolvedConfig } from './config.js';
import { Diagnostics } from './diagnostics.js';
import { type Preferences } from './preferences.js';
import { type ProviderCatalog } from './shared.js';
/** Minimal logger surface. */
export interface AdapterLogger {
    info(message: string): void;
    warn(message: string): void;
}
/** Hooks and live readers the plugin supplies. */
export interface NanoGptAdapterOptions {
    /** Current validated connection facts; called once per operation. */
    config: () => ResolvedConfig;
    /** Current catalog manager. */
    catalog: () => CatalogManager;
    /** Current preferences document. */
    preferences: () => Preferences;
    /** Resolve the credential named by a configuration snapshot. */
    resolveApiKey: (config: ResolvedConfig) => Promise<string | undefined>;
    /** Resolve the optional attachment service at request time. */
    resolveAttachments?: () => AttachmentStore | undefined;
    /** Resolve one durable file reference's model-facing handle text. */
    resolveFileText?: (ref: FileAttachmentRef) => string;
    /** Logger. */
    logger: AdapterLogger;
    /** Fetch implementation, injectable for tests. */
    fetch?: typeof fetch;
    /** Attribution headers, injectable for tests. */
    attribution?: () => Record<string, string>;
    /** Diagnostics buffer. */
    diagnostics?: Diagnostics;
    /** Clock override, for tests. */
    now?: () => number;
}
/** The NanoGPT provider adapter. */
export declare class NanoGptAdapter extends LlmAdapter {
    private readonly options;
    private generationCache;
    private readonly providerCache;
    private readonly providerInflight;
    private readonly diagnostics;
    private readonly now;
    /** @param options - live readers and request hooks. */
    constructor(options: NanoGptAdapterOptions);
    /** Capture one generation, reusing the last one while its key is unchanged. */
    private capture;
    /** @returns this route's display metadata. */
    providerInfo(provider: string): LlmProviderInfo;
    /** @returns the registration-captured retry policy for this route. */
    providerRetryPolicy(_provider: string): ResolvedRetryPolicy | undefined;
    /** @returns the models this route advertises to selectors. */
    listModels(provider: string): Promise<readonly LlmModelInfo[]>;
    /** Fetch or reuse one provider-discovery answer. */
    private providerCatalog;
    /** Resolve one model's reasoning policy, including pinned-route facts. */
    private policyFor;
    /** Resolve one exact model's DSH metadata within a captured generation. */
    private resolveWithin;
    /** @inheritdoc */
    resolveModel(provider: string, model: string, signal?: AbortSignal): Promise<LlmResolvedModelInfo>;
    /** @inheritdoc */
    prepareCall(provider: string, model: string, signal?: AbortSignal): Promise<PreparedAdapterCall>;
    /** @inheritdoc */
    stream(options: GenerateOptions): AsyncIterable<StreamChunk>;
    /** Attribute every provider request to the harness. */
    private attribution;
    /** Resolve the request's credential, failing loud when the reference is unset. */
    private credential;
    /**
     * Validate request features against a pinned upstream route. Provider
     * discovery can disclose smaller output budgets and missing tools/images/
     * caching for one route; sending the model-wide request anyway would either
     * fail at the provider or overstate capability in the preview.
     */
    private validatePinnedRoute;
    /** Build the protocol context for one request. */
    private prepare;
    /** Translate one stream and record a safe diagnostic. */
    private streamWithGeneration;
    /** Record one failed request without request content. */
    private recordFailure;
    /** Append one diagnostic entry. */
    private recordDiagnostic;
    /**
     * Serialize a synthetic request with the real serializer, without sending it.
     * The returned headers carry a redacted placeholder instead of the credential.
     * @param options - sample request controls.
     * @returns the exact wire request the adapter would send.
     */
    preview(options: GenerateOptions): Promise<import('./protocols/common.js').PreparedWireRequest>;
    /** Read (or reuse) provider discovery for one exact model. */
    providerCatalogForModel(modelId: string, signal?: AbortSignal): Promise<ProviderCatalog | undefined>;
    /** Diagnostic buffer access for the settings RPC. */
    diagnosticsBuffer(): Diagnostics;
    /** Drop cached provider-discovery answers. */
    clearProviderCache(): void;
}
