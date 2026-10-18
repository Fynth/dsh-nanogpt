# Architecture

`dsh-nanogpt` is a Cordis bundle for DeepSeek Harness (DSH) that adds one
independent provider route, `nanogpt`, and one native Settings page. It does
not modify DSH Core, re-use another provider's model namespace, or proxy
requests through the browser.

## System shape

```text
DSH Agent loop
  │  GenerateOptions { provider: 'nanogpt', model, reasoningEffort, messages, tools, signal }
  ▼
@deepseek-ai/dsh-llm  (LlmRuntime)
  │  resolveModelInfo / prepareCall / llm/stream waterfall
  ▼
NanoGptAdapter (src/adapter.ts)
  ├─ configuration snapshot (src/config.ts, volatile Config)
  ├─ preferences snapshot (src/preferences.ts, versioned JSON + atomic write)
  ├─ catalog snapshot (src/catalog-store.ts, disk cache + live refresh)
  ├─ exactly-one-generation capability capture
  ├─ per-exact-model reasoning policy (src/reasoning.ts)
  │    └─ optional per-route discovery (src/discovery.ts → /api/models/:id/providers)
  ├─ protocol serializer (src/protocols/{chat,responses,messages}.ts)
  ├─ authenticated transport (src/http.ts, src/errors.ts)
  └─ stream normalizer (src/stream/{chat,responses,messages}.ts → DSH StreamChunk)
  ▼
https://api.nano-gpt.com/api/v1  (or a configured, validated gateway endpoint)
```

The browser never holds the API key and never talks to NanoGPT. The Host owns
credential resolution and all provider HTTP.

## Host components

| Module | Responsibility |
| --- | --- |
| `src/index.ts` | Loader row entry: registers the adapter, configurable-provider directory entry, model-discovery offer, catalog scheduler, and the authenticated `/nanogpt` RPC channel. Also owns the settings namespace lookup and lifecycle effects. |
| `src/config.ts` | Schemastery `Config` with volatile fields, URL normalization, enum validation, routing/advanced controls, retry policy, and reserved `extraBody` keys. |
| `src/shared.ts` | Stable constants (provider id, plugin name, default endpoint, effort vocabulary, protocol and visibility enums) and shared types. |
| `src/discovery.ts` | Public model-catalog fetch (`/models?detailed=true`), provider discovery, catalog-reachability probe, connection test against an authenticated endpoint, timeout/abort handling, response-size caps. |
| `src/catalog.ts` | Pure normalization of the public catalog into exact ids, display names, context/output caps, modalities, capabilities, pricing, service tiers, subscriptions, aliases, providers, reasoning ladders, and verification timestamps. Unknown fields are tolerated; nothing is invented. |
| `src/catalog-store.ts` | Last-known-good snapshot, atomic 0600 disk cache, stale-while-revalidate scheduler inputs, concurrent-refresh deduplication, change hash, failure retention, disposal. |
| `src/reasoning.ts` | Per-exact-model capability resolver and the only module that maps a selection to protocol fields (`reasoning_effort`, `reasoning.effort`, `output_config.effort`, `thinking.disabled`). Tracks source, unverified levels, experimental inference, always-thinking, default and disable legality. |
| `src/protocols/*` | Message/tool/history conversion and body construction for Chat Completions, Responses, and Anthropic Messages. `common.ts` owns protocol/routing resolution, max-token and sampling rules, provider/caching suffixes, and reserved-field merging. |
| `src/sse.ts` | Byte-boundary-safe SSE parser (CRLF, comments, multi-line data, unterminated final event, idle timeout, cancellation). |
| `src/stream/*` | Protocol stream translators to DSH `StreamChunk`s: block start/delta/end invariants, reasoning vs text vs tool arguments, usage, finish reason, replay envelope, error classification. |
| `src/replay.ts` | Opaque protocol replay state and thinking-signature preservation used for conversation continuation. |
| `src/preferences.ts` | Versioned user preferences (favorites, hidden, pinned, per-model effort/protocol/routing/advanced overrides, UI state), revision-guarded atomic writes, normalization on load, secret-free export/import. |
| `src/rpc.ts` | Endpoint-scoped handler for `/nanogpt`: status, catalog refresh/status, credentials, connection test, model query/detail/providers, preferences, usage, diagnostics, request preview. All payloads are validated; errors are classified and sanitized. |
| `src/model-view.ts` | Joins catalog, deployment overrides, and preferences into the model-browser view. |
| `src/usage.ts` | Authenticated balance/usage/subscription reads with distinct failure records per section. |
| `src/diagnostics.ts` | Bounded, content-free request facts (protocol, requested vs wire effort, status, duration, tokens, safe failure). |
| `src/errors.ts` | HTTP/transport classification into `LlmError` codes and safe failure facts. |

## Browser component

`client.js` is a plain-JavaScript DSH Client plugin in the host's module
format (React from the browser module table, no harness package imports). It
registers exactly one `settings.section` entry (`nanogpt`, order 14) and calls
the authenticated Host channel through `ctx.connection.rpc.call('/nanogpt', …)`.
It uses host theme tokens, registers EN/RU dictionaries through `ctx.locale`,
and holds no credential or provider state of its own.

The page is a management console over the Host's real state: overview,
connection/credential controls, catalog browser, model detail, reasoning
editor, routing/billing, usage, diagnostics with request preview, and
preferences export/import. Every mutation goes through the same RPC endpoints
the Host validates; there is no parallel serializer and no frontend-only
reasoning state.

## Lifecycle and ownership

- The bundle patch inserts one row, `llm-nanogpt`, from package `dsh-nanogpt`.
- `apply` validates the row configuration at mount, then registers:
  - one configurable-provider directory entry keyed by the row id (or the
    default `llm-nanogpt` namespace);
  - one adapter for `['nanogpt']`;
  - one model-discovery offer for that namespace;
  - one catalog refresh interval, in a `ctx.effect` that clears it and disposes
    the catalog manager;
  - one `/nanogpt` RPC channel inside `ctx.inject(['connection'])` when the
    profile has a browser transport. Headless compositions keep every other
    capability and simply skip the channel.
- Every registration is Cordis-effect-owned. Hot reload/unload withdraws the
  adapter, directory entry, discovery offer, timer, cache manager, and RPC
  channel. A configuration edit changes the next captured generation; an
  in-flight request keeps the generation it captured before its first await.
- Model discovery is also exposed to the native Models page:
  `registerModelDiscovery(settingsNs, …)` accepts a draft endpoint/key only
  for the configured endpoint; a different host is refused rather than
  receiving the key.

## Capability capture and request pipeline

1. `capture()` snapshots configuration, preferences, and catalog once and
   computes exact-model, alias, and override maps.
2. `resolveModel` resolves the exact model (or keeps an unlisted id with no
   invented metadata) and builds DSH reasoning metadata from the policy.
3. `prepareCall` binds that generation and returns a one-shot stream; the
   adapter refuses a second dispatch.
4. `stream`:
   - resolves the exact model and policy;
   - selects the protocol (deployment default with per-model override);
   - resolves the credential from the DSH credentials service or environment;
   - serializes messages, tools, tool history, replay state, images/files,
     routing, caching, billing, service tier, and reasoning fields;
   - sends one authenticated `fetch` with attribution headers, bounded header
     timeout, and caller cancellation;
   - normalizes the SSE stream into DSH chunks;
   - records content-free diagnostics after success or failure.
5. Cancellation aborts the HTTP request and the parser, removes listeners, and
   never emits a second finish.
6. Retries are owned by DSH Core's `llm-retry` row using the adapter's declared
   policy; the adapter never replays a request after a stream has started.

## Reasoning model

The resolver produces a `ReasoningPolicy` per exact model (and pinned route):
selectable efforts, default, always-thinking, disable legality, source,
unverified levels, experimental flag, notes, and verification time.

Resolution order is documented in [decisions.md](decisions.md): explicit
per-route facts, API catalog ladder, model-specific documented facts, explicit
user/deployment override, clearly labelled experimental inference, unknown.
Generic `capabilities.reasoning: true` never means seven levels.

`reasoning.ts` is the single wire mapper:

| Protocol | Effort | Disable (`none`) | Hide output |
| --- | --- | --- | --- |
| Chat Completions | `reasoning_effort` | `reasoning_effort: "none"` where legal | `reasoning.exclude: true` |
| Responses | `reasoning.effort` | `reasoning.effort: "none"` where legal | `reasoning.exclude: true` |
| Anthropic Messages | `output_config.effort` | `thinking: { type: "disabled" }` | not documented; omitted with a warning |

`auto`/omitted never sends an effort. The legacy `off` alias maps to `none`
only after the same legality check; it is never sent literally.

The native DSH selector receives `LlmModelReasoningInfo` from `resolveModel`:
each effort id/name in escalation order, plus the configured default when one
exists. Selecting a level reaches `GenerateOptions.reasoningEffort`; the
adapter re-validates it before HTTP and the request preview uses the same
serializer.

## Data and security boundaries

- Secrets: only the Host resolves them; the browser receives booleans and
  reference names. The API key is never logged, never in URLs, never in
  diagnostics, never in preview headers, and never in preference exports.
- Endpoints: default `https://api.nano-gpt.com/api/v1`; custom endpoints are
  parsed, scheme-validated, and private/insecure hosts require explicit opt-in.
  Requests use `redirect: 'error'`.
- The browser RPC is authenticated by DSH Connection's browser session; the
  channel is only mounted on `connection` and every endpoint validates its
  payload.
- Model descriptions and provider data are rendered as text; no HTML injection.
- Tool calls are normalized into DSH's `tool-call` blocks; malformed arguments
  become controlled failures. DSH remains the only executor and permission
  authority.

## Persistence

| Data | Location | Notes |
| --- | --- | --- |
| Deployment config | `cordis.patch.yml` / row Config | Base URL, credential reference, protocol, defaults, routing, retry policy. |
| User preferences | `$DSH_HOME/dsh-nanogpt/preferences.json` | Versioned, revisioned, atomic 0600 write, no secrets. |
| Catalog cache | `$DSH_HOME/cache/dsh-nanogpt/catalog.json` | Versioned, endpoint-matched, atomic 0600 write, last-known-good, offline fallback. |
| Credential | DSH credentials service (`NANOGPT_API_KEY` reference) | Write-only through the Host RPC; environment fallback is read-only. |

See [api-compatibility.md](api-compatibility.md) for the confirmed NanoGPT
surface and [verification-matrix.md](verification-matrix.md) for what has
actually been exercised.
