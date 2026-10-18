# DSH Host Review — NanoGPT provider (`dsh-nanogpt`)

Independent, read-only audit of the host implementation against the installed
DSH 0.2.0-rc.2 contracts, `AGENTS.md`, and NanoGPT's published API documentation.
No source file was modified. Build/test commands and Node probes were run against
the current working tree; this audit notes the snapshot it observed.

- Snapshot: 2026-10-18T22:32+03:00 (Asia/Riyadh/Moscow local `+03:00`).
- DSH install: `/home/rasul/.local/share/dsh-tauri/dependencies/dsh/node_modules/@deepseek-ai/` (package root reports `0.2.0-rc.1`, dependency `@deepseek-ai/dsh` is `0.2.0-rc.2`).
- Live profile: `~/.dsh/profiles/web`, package linked as `dsh-nanogpt`, row id `llm-nanogpt`, process `dsh web` serving `127.0.0.1:3080`.
- Source is concurrently edited by other agents; findings below were re-checked
  after the last build. The "Verified fine" section records what had already been
  fixed at this snapshot.

## 1. Verdict

No P0 or P1 defect remained at this snapshot; the release artifact passes the
project's pack check. Remaining findings are P2 polish/coverage gaps. The core
adapter contract (registration, model discovery, exact model resolution,
reasoning-effort validation, stream chunk shape, terminal finish, usage ordering,
cancellation, credential resolution) is substantially correct.

## 2. Severity-ranked findings

### P1 — required correctness, lifecycle, or release behavior

No open P1 defect remained at this snapshot. The last P1 candidate — a
tool-role image being replaced by `(empty tool result)` — was fixed in the
current tree: Chat projects the tool content through `contentForMessage`,
Messages projects image/file blocks through `projectImage`/`projectFile`, and
Responses preserves a deterministic image placeholder in
`function_call_output`; a regression test now covers it. Earlier findings on
catalog fan-out, routing-goal/caching conflicts, pinned-route output/tool/image/
caching validation, unknown-ladder Auto metadata, alias id echo, schema-default
overrides, token-usage fabrication, and SSE bounds were also re-checked and
fixed. The context-window mapping is correct: OpenAPI defines `context_length`
as the total shared context, not an input-only limit.

### P2 — polish, protocol edges, and optional requirements

#### P2-1. `off` legacy selector — resolved in the final tree

- `src/reasoning.ts:255-281` maps legacy `off` to `none`, but the adapter never
  advertises an `off` effort. DSH validates `GenerateOptions.reasoningEffort`
  against the advertised set before dispatch; a probe with `resolveCallConfig`
  returns `UNSUPPORTED_REASONING_EFFORT` for `off` while `none` succeeds.
- Impact: old DSH session headers / external configs that contain `off` fail
  before the adapter can translate them. `AGENTS.md` §6.6 calls for an explicit
  mapping.
- **Resolved:** `src/adapter.ts:reasoningInfo` now advertises the legacy `off`
  selector only where `none` is legal; the wire mapper translates it to `none`
  and never sends the literal string. The real `LlmRuntime` accepts it, and the
  adapter-level test asserts the serialized body is `reasoning_effort: "none"`.
  The native selector therefore shows both `none` and `off` on disable-capable
  models — a deliberate compatibility alias, not a second capability.

#### P2-2. Remaining pinned-route capability gaps (max input, pricing, early reasoning)

- `validatePinnedRoute` (`src/adapter.ts:469-512`) now rejects a pinned route when
  the request exceeds the route's `maxOutputTokens`, uses tools/images the route
  does not advertise, or enables caching the route does not advertise. That is a
  real improvement.
- Still unapplied: the route's `maxInputTokens` is not checked or surfaced in
  `LlmResolvedModelInfo.context`; route pricing is not used by the request
  preview/cost estimate; and route reasoning narrowing happens in
  `prepare()` (`src/adapter.ts:527`) while `resolveModelInfo` remains model-wide
  by design (to avoid the prior catalog fan-out). DSH validates an explicit
  effort against the model-wide advertised ladder before the adapter can reject a
  route-unsupported level in `prepare()`; the native picker can therefore offer a
  level that the pinned route will fail later, with a late `UNSUPPORTED_OPTION`.
  `buildModelViews`/`effortView` (`src/model-view.ts:59-107`) likewise show
  model-wide efforts and omit the synthetic `auto` selector.
- Impact: settings/native picker can disagree with an actual pinned-route request
  (§7.5, §10.4); a route with a smaller input cap is not validated locally.
- Fix: expose route input capacity and pricing to the UI/preview, and either
  resolve route reasoning facts for the selected model's catalog entry (not the
  whole catalog) or make the route-unsupported failure visible before selection.
  Add a route fixture whose `maxInputTokens`/pricing differ from the model and
  whose efforts are narrower than the catalog.

#### P2-3. Reasoning resolver priority and “always thinking” edge cases

- `resolveReasoning` checks `override` before the API catalog
  (`src/reasoning.ts:154-176`). `AGENTS.md` §6.3 puts current API metadata above
  user overrides. The override is marked unverified, but it can still advertise
  values the catalog says are unsupported.
- A documented `alwaysThinking` model whose API ladder includes `none` is treated
  as non-always-thinking because the condition at
  `src/reasoning.ts:203-207` requires `!efforts.includes('none')`; a probe for
  `anthropic/claude-opus-5.5` with an injected API `none` returns
  `supportsDisable: true` and serializes `reasoning_effort: "none"`, contrary to
  the documented model behavior.
- Documented policies with no API ladder get `experimental: true` and all levels
  in `unverifiedLevels` (`src/reasoning.ts:201-231`), even though the source is
  official documentation; deployment overrides are also hardcoded as
  `source: 'user-config'` in `src/adapter.ts:180-190`.
- Fix: reorder to API → documentation → verified → explicit override; remove
  `none` when a documented/route `alwaysThinking` fact says so; distinguish
  “unverified” from “experimental”; carry deployment provenance through.

#### P2-4. Configuration hot-reload does not invalidate model selectors/catalog for every relevant field

- `notifyAdapters()` is called on catalog changes, after boot cache/preferences
  load, and after preference RPC writes. Volatile config changes that affect
  `listModels`/`resolveModel` (`models`, `defaultReasoningEffort`,
  `experimentalEfforts`, `displayName`, `baseURL`) have no listener
  (`src/index.ts:124-143`, `210-218`).
- `baseURL` changes switch request routing immediately but the catalog snapshot
  remains from the old endpoint until the next refresh; `loadCache()` only runs at
  mount. `displayName` is captured by `registerAdapter`/`registerConfigurableProviders`
  at registration (`src/index.ts:160-166`), so changing it does not update
  provider labels.
- Impact: native model picker and settings page can be stale after a live profile
  edit; requests can use new endpoint/model config while the picker advertises the
  old catalog.
- Fix: listen for volatile config updates (or use an explicit adapter/catalog
  invalidation seam), emit `llm/adapters-updated` after model-affecting config
  changes, invalidate the catalog when `modelsEndpoint` changes, and either
  re-register provider metadata on display-name changes or document that display
  names require a reload.

#### P2-5. Native Models page treats `llm-nanogpt` as an unknown provider family

- `registerConfigurableProviders` declares `settingsPath: []` for
  `llm-nanogpt` (`src/index.ts:160-166`). The installed
  `@deepseek-ai/dsh-client-ui-settings-models` only curates `llm-deepseek` and
  `llm-pi-ai` layouts; other namespaces render a hint and disable submit in
  `ProviderEditor` (`layoutOf` returns `unknown`).
- Impact: NanoGPT appears as a provider row on the native Models page but cannot
  be edited there; users must use the plugin's own page. This does not break
  other routes, but it is a compatibility/UX inconsistency.
- Fix: either give the directory entry a dedicated settings profile shape the
  native page can edit, register the plugin's own `settings.models.provider-card`
  slot, or set `autoGenerate:false`/document why the row is read-only.

#### P2-6. Web-search suffix vocabulary is incomplete

- `WEB_SEARCH_MODES` (`src/config.ts:53-77`) omits documented suffixes:
  `online/sofya`, `online/valyu`, `online/valyu-deep`, `online/valyu-web`,
  `online/valyu-web-deep` (NanoGPT Model Suffixes page).
- Impact: users cannot select those documented search providers; advanced config
  values are rejected at validation.
- **Resolved:** the missing `online/sofya` and `online/valyu*` values were added
  to `WEB_SEARCH_MODES`; the config test validates the enum.

#### P2-7. `extraBody` still permits overriding serializer-owned provider fields

- `RESERVED_EXTRA_BODY_KEYS` (`src/config.ts:337-388`) covers reasoning, routing,
  billing, token limits and some Responses fields, but not `promptCaching`,
  `prompt_caching`, `cache_control`, `top_k`, `top_a`, `min_p`, or
  `explicitCacheControl`.
- Impact: a deployment `extraBody` can overwrite the validated chat
  `promptCaching` helper or inject a conflicting `cache_control`/sampling field
  after the protocol module assembled it. It cannot override the reasoning
  selection, but it can silently change caching/sampling behavior.
- **Partially resolved:** `promptCaching`, `prompt_caching`, `cache_control`,
  and `top_k` are now reserved. `top_a`, `min_p`, and `explicitCacheControl` are
  still not in the reserved set; they are not used by the current serializers.

#### P2-8. Responses `max_output_tokens` minimum is not enforced

- NanoGPT Responses docs: `max_output_tokens` minimum 16. The plugin accepts
  `maxTokens: 1` (config schema `z.number().step(1).min(1)`, `GenerateOptions`),
  then sends it as `max_output_tokens` (`src/protocols/responses.ts:203`).
- Impact: a configured cap of 1–15 produces a provider 400 instead of a local
  validation error.
- **Resolved:** Responses now rejects a cap below 16 before I/O.

#### P2-9. SSE/HTTP streaming edges

- SSE parser handles LF/CRLF, multi-line data, comments, split UTF-8, idle and
  cancellation, and now has `MAX_SSE_LINE_BYTES`/`MAX_SSE_EVENT_BYTES`
  (`src/sse.ts:102-190`). Remaining edges: bare-CR line endings are not
  recognized (the parser only splits on `\n`), the final unterminated buffer
  processes only one line, and an empty `data` field with an event name reaches
  `parseJsonEvent` and fails.
- Streaming requests do not set `Accept: text/event-stream`; the
  `streamingHeaders` helper in `src/http.ts:165-172` is unused. Most NanoGPT
  deployments accept `stream:true` without it, but the documented examples send
  it. The response content type is not checked; an HTML 200 becomes a
  `STREAM_CLOSED`/parse error rather than an explicit “not an SSE response”.
- Impact: rare provider/proxy behavior and harder diagnostics.
- **Partially resolved:** streaming requests now send
  `Accept: text/event-stream`, and an obvious `application/json`/`text/html`
  200 is rejected as `MALFORMED_RESPONSE` before parsing. Bare-CR line endings,
  a final multi-field unterminated tail, and empty-data events remain documented
  edges.

#### P2-10. Finish/stream edge content can be lost or misclassified

- Chat maps `finish_reason: "content_filter"` to ordinary `stop`
  (`src/stream/chat.ts:138-143`), and Responses maps every
  `response.incomplete` to `max-tokens` (`src/stream/responses.ts:235-240`).
  DSH has no content-filter finish reason, but a controlled error or an explicit
  warning is better than silently presenting filtered output as a normal stop.
- Messages ignores `redacted_thinking` and `server_tool_use` blocks
  (`src/stream/messages.ts:68-90`). A Claude response consisting only of
  redacted thinking, or a web-search/server-tool response, can become
  `EMPTY_RESPONSE` or lose content.
- Responses `emitOutputFallback` emits only the first unstreamed reasoning,
  text, or function-call item (`src/stream/responses.ts:87-113`); a provider that
  sends complete `output` without deltas loses additional items. It also ignores
  `web_search_call` and `image_generation_call` output items.
- Chat ignores the legacy `delta.function_call` shape (only `tool_calls`).
- Impact: edge streams lose content or report a misleading finish reason.
- Fix: add explicit handling/ warnings per protocol and fixtures for redacted
  thinking, server tool use, multiple fallback items, and content-filter stops.

#### P2-11. `Messages` hide setting is surfaced only as a warning

- `wireReasoning` intentionally does not serialize a hide field for Messages
  (`src/reasoning.ts:350-358`) and `prepareMessagesRequest` adds a warning that
  reasoning remains visible (`src/protocols/messages.ts:196-199`). The setting is
  global; a user selecting “hide” and using a Messages-configured model will see
  reasoning anyway. The request preview `excludeReasoning` is `false`
  ([`src/protocols/messages.ts:264`](../src/protocols/messages.ts)), which is
  technically correct but may surprise a UI that equates the setting with the
  flag.
- Impact: requirement §6.7 “do not misrepresent” is met only if the warning is
  visible; if the custom page does not surface transport warnings, the setting
  appears to do nothing.
- Fix: surface the transport limitation in the settings UI/preview near the
  visibility control, or provide a per-protocol disable/warning state. If the
  documented `:reasoning-exclude` suffix is eventually accepted on Messages, use
  it; do not send an undocumented field.

#### P2-12. Image budget/pricing integration is absent

- The adapter enforces a local 24 MiB base64 budget and throws
  `INVALID_REQUEST` on excess (`src/adapter.ts:471-494`). It does not implement
  `LlmAdapter.imageRequestPricing` or declare an `LlmImageRequestBudget`, so the
  token meter uses a neutral estimate and `dsh-compaction-image-offload` cannot
  receive `IMAGE_OFFLOAD_REQUIRED` / `offloadImages` for a provider-specific
  budget.
- Impact: large image histories fail hard instead of following DSH's offload
  path; image cost is approximate.
- Fix: declare the route budget/metadata and use `IMAGE_OFFLOAD_REQUIRED` when
  the request exceeds the declared budget; add `imageRequestPricing` if NanoGPT
  charges visual tokens.

#### P2-13. Optional spec coverage still missing

These are honestly documented as unimplemented or are outside the minimal host
surface; they are not claimed as finished:

- Cost safeguards (`AGENTS.md` §11.4): no per-request cost warning, daily/monthly
  spending warning, expensive-model confirmation, or low-balance alert. Pricing
  metadata and authenticated usage reads exist; there is no enforcement UI.
- Multiple NanoGPT profiles/accounts (§4.4): one `nanogpt` route/profile.
- Auxiliary NanoGPT media tools (§15.2): no image/TTS/STT/video/web-search tools.
- Inline mid-conversation reasoning-effort updates (§6.10; NanoGPT documents
  them for GPT-6 Astra / Fable 5.1). DSH's request headers are not obviously a
  lossless carrier for the required inline placement; standard per-request effort
  works. This limitation should be documented rather than implied.
- Structured-output controls / `text.format`, `top_k`, `tool_choice`,
  `parallel_tool_calls` (§14): only `extraBody` can reach them; no validated UI.
- Legacy/merged reasoning-content endpoint variants (§6.7): the standard
  `/chat/completions` path is used; `/api/v1legacy` and `/api/v1thinking` variants
  are not selectable.
- Multi-model/media catalog separation (§15.1): `/api/v1/models` text catalog is
  used; image/video/audio catalogs are not surfaced.

#### P2-14. RPC/HTTP hardening and diagnostics gaps

- The `/nanogpt` handler validates field types and lengths, but has no
  per-endpoint body-byte cap; it relies on the installed Connection bridge's
  default `maxRequestBodyBytes` (300 MiB). `preferences/import` and
  `request/preview` therefore accept much larger JSON envelopes than their
  documented file-level limits. Add endpoint caps and reject oversize input with
  a stable RPC code.
- `requestJson` maps every non-auth/non-rate-limit/non-5xx HTTP error to
  `INVALID_REQUEST`; an account endpoint 402 becomes `INVALID_REQUEST` rather
  than `QUOTA` (adapter HTTP failures use `failureCodeFor` correctly). Test
  Connection classifies 400 as `unknown-failure` rather than
  `invalid-endpoint`.
- Provider error messages are retained in diagnostics, RPC failures, and
  `logger.warn` without a display cap. They do not include credentials by
  construction, but a provider could echo request-adjacent text; bound and
  sanitize the rendered message. The `http.ts` `retryAfterMs` helper is unused
  by `requestJson`, so account/catalog failures do not expose `Retry-After`.

#### P2-15. Catalog freshness, cache validation, and cancellation polish

- `CatalogManager.stale()` reports a snapshot fresh until
  `max(2 * refreshWindow, 24 h)` (`src/catalog-store.ts:161-168`), so a 5-minute
  refresh policy still labels a several-hour-old catalog “fresh”. Revalidation is
  boot/interval/manual only; there is no request-triggered stale-while-revalidate
  after boot, and a profile with `autoRefresh:false` never revalidates a stale
  cache automatically.
- `refresh()` returns an in-flight promise without racing the caller's
  `AbortSignal`; a manual RPC abort cannot cancel a shared refresh. `dispose()`
  only sets a flag and does not abort an in-flight catalog fetch.
- `validateCacheDocument` validates only id/name/version/endpoint and casts the
  model array; malformed cached `contextWindow`, `inputModalities`,
  `reasoningEfforts`, or pricing can reach DSH metadata validation and fail a
  model (or the provider group). Validate/normalize cached model records with the
  same rules as the API path, and reject the cache cleanly on failure.
- **Partially resolved:** `dispose()` now aborts the active catalog fetch and a
  test covers it. Manual-refresh abort racing, request-triggered revalidation,
  the 24 h stale floor, and deep cached-record normalization remain open.

#### P2-16. Documentation and test drift

- `docs/api-compatibility.md` risk #4 still says `context_length` is “max input
  tokens” and treats the one-to-one mapping as a semantic mismatch. The
  authoritative OpenAPI (`https://nano-gpt.com/openapi.json`,
  `components.schemas.Model.properties.context_length`) says “Total context
  window shared by input and generated output.” The implementation is correct;
  the doc risk should be removed/corrected. Some risk-table line references were
  also written against an earlier source snapshot.
- `docs/verification-matrix.md` now records the current 155-test run and the
  pinned-route/routing-guard boundaries. The Messages-hide, Responses-sampling,
  routing-guard, and pinned-route validation documentation was updated after
  those fixes and matches current source.
- Test gaps are listed in §5. In particular there is no test for the context
  mapping, pinned-route capability threading, provider-discovery fan-out,
  caching+routing suffix conflicts, idle-timeout-after-output, tool-role images,
  `off` through DSH validation, or config hot-reload invalidation.

## 3. Verified fine (important non-findings)

These were inspected/probed and are **not** defects at this snapshot:

- **Adapter contract shape**: `providerInfo`, `listModels`, `resolveModel`,
  `prepareCall`, `stream`, and `providerRetryPolicy` match
  `@deepseek-ai/dsh-llm` types. Registration is atomic for the single
  `nanogpt` route and disposed with the fiber.
- **Exact model IDs / aliases**: `resolveWithin` now echoes the requested id
  (including an alias) while using the canonical catalog record, so DSH's
  `resolved.id === requested` validation passes. Probe: canonical and alias both
  resolve via `ctx.llm.resolveModelInfo`.
- **Unknown reasoning ladders**: models with `capabilities.reasoning: true` but
  no `reasoning_efforts` now advertise only the adapter-owned `auto` selector,
  not an empty effort list. The full live 647-model cache builds a native model
  catalog with 1 group, 647 models, 0 failures, 155 Auto-only reasoning models.
- **Reasoning effort core path**: probe of `resolveCallConfig` with
  `defaultReasoningEffort: high` returned: omitted → `high`, `auto` → `auto`,
  `none` → `none`, `high` → `high`, `max` → `max`; unsupported `xhigh` rejected.
  The adapter's default-effort materialization is visible through
  `prepareCall().adapterDefaults`.
- **Stream chunk shape**: block-start/delta/block-end, tool-call deltas, usage
  before finish, exactly one terminal finish, and `ReplayEnvelope` are produced
  for Chat/Responses/Messages. `EMPTY_RESPONSE`, `MALFORMED_TOOL_ARGUMENTS`,
  `STREAM_CLOSED`, and `STREAM_INTERRUPTED` paths are controlled.
- **SSE parser**: arbitrary byte boundaries, split UTF-8, CRLF, multi-line data,
  comments, idle timeout, caller cancellation, and oversized-line/event caps are
  tested and pass.
- **Token accounting**: current `chatTokenUsage`/`responsesTokenUsage`/
  `messagesTokenUsage` no longer fabricate 0/0 when only total or one side is
  present; they return `undefined` when essential counters are missing.
- **Credential handling**: managed credential store first, environment fallback;
  missing/invalid credentials become `MISSING_CREDENTIAL`/`INVALID_CREDENTIAL`;
  credentials never returned by RPC status, preview headers are redacted, and
  export contains no secrets.
- **Account reads**: `check-balance` uses both bearer and `x-api-key` headers,
  reads `usd_balance`/`nano_balance`/`nanoDepositAddress`; usage reads default to
  the last 30 UTC days (docs allow a range-less read) and send
  `scope=current_key&group_by=day,model`; subscription usage uses the documented
  path.
- **Configuration schema defaults**: schema-parsed model overrides no longer
  fail on empty `inputModalities`/`reasoningEfforts`; default-only routing and
  advanced fields are dropped; a partial model `advanced`/`routing` override
  preserves global controls. Volatile fields expose `.get()` and `plainOptions`
  snapshots them.
- **Lifecycle/notifications**: catalog boot load and preferences load now emit
  `llm/adapters-updated`; preference RPC writes also notify. The scheduler timer
  is cleared and the catalog disposed with the fiber.
- **Custom channel**: a live unauthenticated `POST /nanogpt/status` returns
  `401 unauthorized`, proving the channel is mounted behind Connection's
  browser trust/auth fence (not a public route).
- **Compatibility**: the `nanogpt` route coexists with `ollama-cloud`,
  `dsh-reasoning-level`, `llm-pi-ai`, and DeepSeek rows; the plugin does not
  monkey-patch other adapters or host services. The installed
  `dsh-reasoning-level` only reads `resolveModelInfo` and hooks agent/stream
  waterfalls; no direct conflict was observed.
- **No invented host APIs**: all host calls used by the host code (`ctx.llm.*`,
  `ctx.get('credentials'|'attachments'|'agentDefaultModel')`,
  `ctx.inject(['connection'])`, `connection.rpc.handle`, `ctx.effect`,
  `ctx.emit`, `attachments.readImageRequest`, `ctx.llm.fileRequestText`) exist in
  the installed packages.

## 4. Requirements coverage summary

| Area | Status | Note |
| --- | --- | --- |
| Provider registration / native route | verified host-side | live row active; `listProviders` route; channel 401 |
| Dynamic discovery / cache / refresh | verified host-side | 647-model live cache; interval/manual/cache |
| Exact model IDs / aliases | verified at core contract | alias now echoes requested id |
| Reasoning vocabulary / Auto / none / xhigh / max | unit + core probes | serializer and core config verified; no live paid call |
| Context capacity | verified host-side | `context_length` is OpenAPI “total context shared by input and output”; one-to-one mapping is correct |
| Per-model reasoning metadata | partial | unknown ladders Auto-only; route facts not in settings summary |
| Always-thinking / disable rules | partial | documented-edge bug P2-3 |
| Chat/Responses/Messages serialization | partial | protocol tests; routing guards fixed |
| Streaming / tool calls / usage / cancellation | partial | parser/translator tests; tool-role images fixed and tested |
| Credentials / connection test | partial | host logic tested; no real key/restart/live auth |
| Model browser / settings UI | partial | host RPC supports; client under separate rewrite; native Models row unknown P2-5 |
| Pricing / usage | partial | metadata/usage readers; no live account read; cost safeguards missing P2-13 |
| Routing / billing / caching / tiers | partial | documented fields; routing guard fixed; remaining route gaps P2-2 |
| Persistence / import/export | verified host-side | revisions/atomic/import/export; no restart exercise |
| Existing DSH compatibility | verified host-side | route isolation; `dsh-reasoning-level` inspection |
| Release artifact | verified host-side | `pack:check` OK (69 files); clean-profile tarball install still not exercised |
| Live inference / browser E2E | partial | 21/21 live smoke checks passed on subscription-included models (usage netCost 0); browser visual run and paid non-subscription matrix not performed |

Acceptance-scenario caveats: A (install) is partial because the tarball check now passes but a
clean-profile tarball install/uninstall was not exercised; B (credential
restart) is fake-provider only; C/E–I (reasoning wire) are serializer/core-level
only; J/K are capability/serializer-level; L/M are unit-level; N/O are partial;
Q/R are unit-level and the caching+routing guard now rejects suffix-transport
conflicts while allowing the documented Chat body combination; S is metadata-only;
T is observed in the live profile but the native Models page row is read-only.

## 5. Test gaps

Current `npm test` passes 150 tests with 3 skipped (live catalog, no key). Missing
high-value tests:

1. DSH-core integration: `prepareCall`/`resolveCallConfig` with `off`, alias,
   unknown ladder, default effort, and unsupported effort (some exist, but `off`
   is not covered through core).
2. Pinned provider capabilities: route `maxInputTokens`, pricing, and early
   route-specific reasoning (output/tools/images/caching are validated).
3. Regression test: catalog build with `routing.mode: provider` must make zero
   provider-discovery fetches (now true after `includeRoute=false`).
4. Regression: tool-role image/file projection on all three protocols (fixed).
5. SSE bare CR, final multi-field tail, empty data event; streaming `Accept` /
   content-type.
6. Config hot reload: model list/reasoning metadata invalidation, baseURL change,
   displayName update.
7. Release: `pack:check` (passing), `npm pack`, install-into-clean-profile,
   uninstall.
8. Browser/UI: settings page, model picker, hide/warning surfacing, native
   Models row.
9. Live smoke with a small budgeted key (connection test + one completion +
   one tool continuation), otherwise clearly report not run.

## 6. Verification log

Commands/probes run against this tree (all read-only except build artifacts):

```text
npm run typecheck
  -> exit 0

npm run build
  -> exit 0

npm test
  -> 155 tests, 152 pass, 0 fail, 3 skipped (live gate); live smoke later passed 21/21 on subscription-included models

npm run pack:check
  -> exit 0: OK (69 files; runtime entries, docs, and secret checks passed)

curl -X POST http://127.0.0.1:3080/nanogpt/status \
  -H 'Content-Type: application/json' \
  --data '{"type":"client-request","rpcId":"probe","method":"status","payload":{}}'
  -> HTTP 401 "unauthorized" (channel mounted; Connection auth fence active)

node probes (current lib):
  - buildModelCatalog with live 647-model cache:
      {"groups":1,"models":647,"failures":0,"autoOnly":155,"reasoning":398}
  - same with routing.mode=provider and fake provider endpoint:
      0 fetch calls during catalog build (route facts resolved in prepare/stream)
  - ctx.llm.resolveModelInfo on canonical and alias:
      both OK; alias echoes requested id
  - ctx.llm.resolveCallConfig:
      omitted->high, auto->auto, none->none, high->high, max->max,
      off->UNSUPPORTED_REASONING_EFFORT, xhigh->UNSUPPORTED_REASONING_EFFORT
  - context probe (model context_length=1_000_000, max_output=128_000):
      context.contextWindow === 1_000_000 (matches OpenAPI total-context semantics)
  - routing speed + caching on Messages/Responses:
      throws UNSUPPORTED_OPTION (new guard)
  - idle timeout after one text delta:
      throws STREAM_INTERRUPTED (non-retryable) after block-start/text-delta
  - image-only tool result on image-capable model:
      preserved as native image on Chat/Messages; deterministic placeholder on Responses
  - schema-parsed model override with partial advanced/routing:
      global promptCaching/extraBody and routing mode preserved
  - account headers / usage query:
      accountHeaders sends Authorization + x-api-key;
      usageQuery sends from/to last 30 UTC days, scope=current_key,
      group_by=day,model
```

Installed contract files consulted (read, not assumed):

- `@deepseek-ai/dsh-llm/lib/types/index.d.ts` (`LlmAdapter`, registration,
  prepared calls)
- `@deepseek-ai/dsh-llm/lib/types/types.d.ts` (`StreamChunk`, `ToolSchema`,
  `LlmResolvedModelInfo`, `LlmModelContext`, `TokenUsage`, `ReplayEnvelope`)
- `@deepseek-ai/dsh-llm/lib/types/content.d.ts` (`requestImageHandleText`,
  `textOnlyImageText`, `projectToolUpdates`)
- `@deepseek-ai/dsh-llm/lib/types/retry-policy.d.ts` and
  `@deepseek-ai/dsh-llm-retry/README.md`
- `@deepseek-ai/dsh-credentials/lib/types/index.d.ts`
- `@deepseek-ai/dsh-settings/lib/types/*.d.ts`
- `@deepseek-ai/dsh-attachment/lib/types/*.d.ts`
- `@deepseek-ai/dsh-client-connection/lib/types/*.d.ts` and `README.md`
- `@deepseek-ai/dsh-api-session-controller/lib/types/catalog.js`
- `@deepseek-ai/cordis` `Volatile`/service/fiber docs and
  `@deepseek-ai/dsh-client-ui-settings-models/lib/client.js` (`layoutOf`)
- NanoGPT docs: Models, Model Suffixes, Provider Selection, Prompt Caching,
  Extended Thinking, Responses, Messages, Usage, Check Balance.

## 7. What I would fix first

1. Tighten the remaining route-fact gaps (P2-2): route max input, pricing, and
   early reasoning selection.
2. Run a clean-profile tarball install/uninstall (pack check already passes).
3. Then the P2 resolver/provenance, model-view, hot-reload, native Models page,
   and hardening polish.
