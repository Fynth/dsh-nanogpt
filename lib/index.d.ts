/**
 * NanoGPT for DeepSeek Harness.
 *
 * One loader row owns the `nanogpt` route: the plugin registers the adapter,
 * keeps the live catalog fresh (cache first, then network), exposes one
 * configurable-provider directory entry and model-discovery offer, and mounts
 * the authenticated RPC channel the native Settings → NanoGPT page reads.
 *
 * @module dsh-nanogpt
 */
import type { Context } from '@deepseek-ai/cordis';
import type { CredentialRef } from '@deepseek-ai/dsh-credentials';
import { type Config as ConfigShape, type ResolvedConfig } from './config.js';
export { Config } from './config.js';
export { NanoGptAdapter } from './adapter.js';
export { CatalogManager } from './catalog-store.js';
export { resolveReasoning, wireReasoning } from './reasoning.js';
export { normalizeCatalogResponse, normalizeModel } from './catalog.js';
export { RPC_CHANNEL, RPC_ENDPOINTS } from './rpc.js';
export type { Config as ConfigShape } from './config.js';
/** Loader row name; also the default settings namespace. */
export declare const name = "llm-nanogpt";
/** The route lives on the LLM seam. */
export declare const inject: string[];
/** Default settings namespace when the loader does not supply an entry id. */
export declare const DEFAULT_SETTINGS_NAMESPACE = "llm-nanogpt";
/** Clock used by the refresh scheduler; exported for tests. */
export declare const REFRESH_TICK_MS = 60000;
/** Build one resolved-config reader that keeps the last good facts on a bad edit. */
export declare function createConfigReader(config: ConfigShape, logger: {
    warn(message: string): void;
}): () => ResolvedConfig;
/** Build the credential resolver used by the adapter and RPC. */
export declare function createCredentialResolver(ctx: Context): (ref: CredentialRef) => Promise<string | undefined>;
/**
 * Mount the NanoGPT provider, catalog, discovery offer, refresh scheduler, and
 * settings RPC channel.
 * @param ctx - plugin context.
 * @param config - live configuration for this row.
 */
export declare function apply(ctx: Context, config: ConfigShape): void;
