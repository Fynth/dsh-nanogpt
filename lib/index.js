import { attributionHeaders } from '@deepseek-ai/dsh-llm';
import { NanoGptAdapter } from './adapter.js';
import { CatalogManager } from './catalog-store.js';
import { plainOptions, resolveConfig } from './config.js';
import { Diagnostics } from './diagnostics.js';
import { fetchCatalog } from './discovery.js';
import { PreferencesStore } from './preferences.js';
import { createNanoGptRpcHandler, RPC_CHANNEL } from './rpc.js';
import { PLUGIN_NAME, PROVIDER } from './shared.js';
export { Config } from './config.js';
export { NanoGptAdapter } from './adapter.js';
export { CatalogManager } from './catalog-store.js';
export { resolveReasoning, wireReasoning } from './reasoning.js';
export { normalizeCatalogResponse, normalizeModel } from './catalog.js';
export { RPC_CHANNEL, RPC_ENDPOINTS } from './rpc.js';
/** Loader row name; also the default settings namespace. */
export const name = PLUGIN_NAME;
/** The route lives on the LLM seam. */
export const inject = ['llm'];
/** Default settings namespace when the loader does not supply an entry id. */
export const DEFAULT_SETTINGS_NAMESPACE = PLUGIN_NAME;
/** Clock used by the refresh scheduler; exported for tests. */
export const REFRESH_TICK_MS = 60_000;
/** Build one resolved-config reader that keeps the last good facts on a bad edit. */
export function createConfigReader(config, logger) {
    let lastGood;
    let warned = false;
    return () => {
        try {
            const resolved = resolveConfig(plainOptions(config));
            lastGood = resolved;
            warned = false;
            return resolved;
        }
        catch (error) {
            if (lastGood === undefined)
                throw error;
            if (!warned) {
                warned = true;
                logger.warn('llm-nanogpt: configuration is invalid; keeping the last good connection facts');
                logger.warn(error instanceof Error ? error.message : String(error));
            }
            return lastGood;
        }
    };
}
/** Build the credential resolver used by the adapter and RPC. */
export function createCredentialResolver(ctx) {
    return async (ref) => {
        const credentials = ctx.get('credentials');
        if (credentials !== undefined) {
            try {
                const hit = await credentials.resolve(ref);
                if (hit !== undefined && hit.value.length > 0)
                    return hit.value;
            }
            catch {
                // Fall through to the process environment.
            }
        }
        const raw = process.env[String(ref)];
        const trimmed = raw?.trim();
        return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
    };
}
/** Map one normalized catalog model to DSH's discovery shape. */
function discovered(model) {
    return {
        id: model.id,
        name: model.name,
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxOutputTokens === undefined ? {} : { maxTokens: model.maxOutputTokens },
        ...model.inputModalities === undefined ? {} : { inputModalities: [...model.inputModalities] },
    };
}
/**
 * Mount the NanoGPT provider, catalog, discovery offer, refresh scheduler, and
 * settings RPC channel.
 * @param ctx - plugin context.
 * @param config - live configuration for this row.
 */
export function apply(ctx, config) {
    const readConfig = createConfigReader(config, ctx.logger);
    // Fail loudly at mount when the row itself is unusable, instead of surfacing
    // a request-time failure nobody attributes to configuration.
    readConfig();
    const resolveCredential = createCredentialResolver(ctx);
    const settingsNs = (() => {
        const fib = ctx.fiber;
        const id = fib?.entry?.options?.id;
        return typeof id === 'string' && id.length > 0 ? id : DEFAULT_SETTINGS_NAMESPACE;
    })();
    const discovery = {
        fetch: globalThis.fetch,
        attribution: attributionHeaders(),
    };
    const preferences = new PreferencesStore();
    let preferencesError;
    const preferencesReady = preferences.load().catch((error) => {
        preferencesError = error instanceof Error ? error.message : String(error);
        ctx.logger.warn(`llm-nanogpt: user preferences could not be loaded; defaults are in use (${preferencesError})`);
    });
    const notifyAdapters = () => {
        try {
            ctx.emit('llm/adapters-updated');
        }
        catch (error) {
            ctx.logger.warn(`llm-nanogpt: could not notify model selectors (${error instanceof Error ? error.message : String(error)})`);
        }
    };
    const diagnostics = new Diagnostics();
    const catalog = new CatalogManager({
        config: readConfig,
        resolveApiKey: async (resolved) => resolved.apiKeyEnv === undefined ? undefined : resolveCredential(resolved.apiKeyEnv),
        deps: discovery,
        logger: ctx.logger,
        onChange: (snapshot, result) => {
            if (!result.changed)
                return;
            // The model picker caches a directory; this registry notification makes
            // resident directories refetch the adapter's newly discovered models.
            notifyAdapters();
        },
    });
    const adapter = new NanoGptAdapter({
        config: readConfig,
        catalog: () => catalog,
        preferences: () => preferences.current(),
        resolveApiKey: async (resolved) => resolved.apiKeyEnv === undefined ? undefined : resolveCredential(resolved.apiKeyEnv),
        resolveAttachments: () => ctx.get('attachments'),
        resolveFileText: (ref) => ctx.llm.fileRequestText(ref),
        logger: ctx.logger,
        fetch: globalThis.fetch,
        attribution: attributionHeaders,
        diagnostics,
    });
    ctx.llm.registerConfigurableProviders([
        {
            provider: PROVIDER,
            displayName: readConfig().displayName,
            settingsNs,
            settingsPath: [],
        },
    ]);
    ctx.llm.registerAdapter([PROVIDER], adapter);
    ctx.llm.registerModelDiscovery(settingsNs, async (request, signal) => {
        const current = readConfig();
        if (request.baseURL !== undefined) {
            let requestedOrigin;
            try {
                requestedOrigin = new URL(request.baseURL).origin;
            }
            catch {
                requestedOrigin = undefined;
            }
            if (requestedOrigin !== current.origin) {
                throw new Error('llm-nanogpt: model discovery only targets the configured NanoGPT origin; edit baseURL in the plugin configuration instead of asking the browser to probe another host');
            }
        }
        const apiKey = request.apiKey ?? (current.apiKeyEnv === undefined ? undefined : await resolveCredential(current.apiKeyEnv));
        const snapshot = await fetchCatalog({
            baseURL: current.baseURL,
            ...apiKey === undefined ? {} : { apiKey },
            timeoutMs: current.requestTimeoutMs,
            ...signal === undefined ? {} : { signal },
        }, discovery);
        const seen = new Set();
        const result = [];
        for (const model of snapshot.models) {
            if (seen.has(model.id))
                continue;
            seen.add(model.id);
            result.push(discovered(model));
        }
        return result;
    });
    // Start from the disk cache immediately; refresh in the background so boot is
    // never blocked by the network.
    let lastRefreshAt = 0;
    let lastWasFailure = false;
    const refresh = async (reason) => {
        lastRefreshAt = Date.now();
        const result = await catalog.refresh(reason);
        lastWasFailure = !result.refreshed && result.failure !== undefined && result.failure.code !== 'ABORTED';
    };
    void (async () => {
        await catalog.loadCache();
        await preferencesReady;
        // Resident model selectors may have asked before either async source
        // settled; one notification after the boot reads makes their directory
        // converge without waiting for the first network refresh.
        notifyAdapters();
        const current = readConfig();
        if (current.autoRefresh)
            await refresh('mount');
    })();
    ctx.effect(() => {
        const timer = setInterval(() => {
            void (async () => {
                const current = readConfig();
                if (!current.autoRefresh || current.refreshMinutes <= 0)
                    return;
                const interval = current.refreshMinutes * 60_000;
                const retry = lastWasFailure ? Math.min(interval, 5 * 60_000) : interval;
                if (Date.now() - lastRefreshAt < retry)
                    return;
                await refresh('interval');
            })();
        }, REFRESH_TICK_MS);
        timer.unref?.();
        return () => {
            clearInterval(timer);
            catalog.dispose();
        };
    }, 'llm-nanogpt: catalog refresh scheduler');
    // The browser channel is optional: headless compositions do not mount
    // `connection`, and every other capability keeps working there.
    ctx.inject(['connection'], (connectionCtx) => {
        connectionCtx.effect(() => {
            try {
                const handler = createNanoGptRpcHandler({
                    config: readConfig,
                    catalog: () => catalog,
                    preferences: () => preferences.current(),
                    store: preferences,
                    adapter,
                    resolveCredential,
                    credentials: () => ctx.get('credentials'),
                    discovery,
                    logger: ctx.logger,
                    agentDefaultModel: () => ctx.get('agentDefaultModel'),
                    onPreferencesChanged: notifyAdapters,
                });
                const connection = connectionCtx.get('connection');
                if (connection === undefined)
                    return () => undefined;
                return connection.rpc.handle(RPC_CHANNEL, handler);
            }
            catch (error) {
                ctx.logger.warn('llm-nanogpt: the settings channel could not mount on the connection service; the connection row needs `webServer` in its inject (this bundle patch adds it)');
                ctx.logger.warn(error instanceof Error ? error.message : String(error));
                return () => undefined;
            }
        }, 'llm-nanogpt: settings RPC channel');
    });
    void preferencesError;
}
