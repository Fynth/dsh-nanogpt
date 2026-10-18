# Implementation plan and status

This is the working plan, updated against the repository rather than the
original proposal. “Verified” means a command or live probe was run and its
result is recorded in [verification-matrix.md](verification-matrix.md).

## Phase 1 — Repository and host audit

| Item | Status | Evidence |
| --- | --- | --- |
| Installed DSH version and package contracts | done | DSH `0.2.0-rc.2`; `LlmAdapter`, `StreamChunk`, `GenerateOptions`, credentials, attachment, connection RPC read from installed `.d.ts`. |
| Live profile and plugin row | done | `dsh-nanogpt` installed into profile `web`; row `llm-nanogpt` reported `fiberPhase: active`. |
| NanoGPT public catalog reachable | done | Live `GET /api/v1/models?detailed=true` normalized 647 chat models in `tests/contracts/live-catalog.test.mjs`. |
| Provider discovery reachable | done | Live `/api/models/:id/providers` returned 11 routes, 11 with effort metadata. |

## Phase 2 — Core plugin

| Item | Status | Evidence |
| --- | --- | --- |
| Bundle manifest + patch + icon + locale | done | `package.json`, `cordis.patch.yml`, `icon.svg`, `locale/{en,ru}.json`. |
| Lifecycle, registration, disposal | done | `apply` with Cordis effects; adapter + directory + discovery + scheduler + RPC. |
| Volatile configuration schema | done | Live `Config.listConfigs` returned the projected schema, including `apiKeyEnv`/`baseURL`/efforts/routing/advanced/retry. |
| Secure credential resolution | done | `createCredentialResolver` uses `credentials.resolve` then environment; write-only set/remove via RPC; unit tests. |
| Connection test | done | Authenticated endpoint test, separate catalog probe, classified results; unit tests. |

## Phase 3 — Model discovery

| Item | Status | Evidence |
| --- | --- | --- |
| Detailed catalog client | done | `src/discovery.ts`, `src/catalog.ts`; live contract test. |
| Normalization of capabilities/pricing/modalities/tiers | done | Fixture tests + live test assertions. |
| Cache, stale-while-revalidate, offline fallback | done | `catalog-store.ts`; unit tests. |
| Refresh deduplication and abort | done | `refresh()` shares one attempt; tests. |
| Native model-discovery offer | done | `registerModelDiscovery(settingsNs, …)`; endpoint mismatch refused. |
| Manual refresh + status | done | RPC `catalog/refresh`, `catalog/status`. |
| Manual exact-model additions/overrides | done | Config `models[]`, preferences model overrides, capability source labels, and the model-detail editor. |

## Phase 4 — Reasoning system

| Item | Status | Evidence |
| --- | --- | --- |
| Effort vocabulary + Auto | done | `shared.ts`, `reasoning.ts`; unit tests. |
| Model-specific ladders, route narrowing | done | Resolver + provider discovery; unit tests. |
| Always-thinking / disable legality | done | Resolver + wire mapper; unit tests. |
| DSH native metadata | done | `resolveModel` returns `reasoning` with ordered efforts and optional default. |
| Protocol wire mapping | done | `reasoning.ts` and protocol tests for Chat/Responses/Messages. |
| `xhigh` vs `max` distinct | done | Tests across protocols. |
| Persistence of selections | done (plugin) | Preferences store + native DSH selection persistence. |
| Mid-conversation inline updates | documented limitation | ADR-013; not implemented. |
| Request preview from real serializer | done | `adapter.preview` + RPC; tests. |

## Phase 5 — Streaming and tools

| Item | Status | Evidence |
| --- | --- | --- |
| Robust SSE parser | done | `tests/unit/sse.test.mjs` (byte boundaries, CRLF, comments, final line). |
| Reasoning/text/tool block invariants | done | `tests/unit/streams.test.mjs` for all three protocols. |
| Multiple tool calls / partial arguments | done | Stream tests; malformed arguments become controlled failure. |
| Usage normalization | done | Stream tests + adapter diagnostics. |
| Cancellation, idle timeout | done | SSE/stream tests. |
| Mid-stream error classification | done | Chat stream test + error mapping. |
| Retries | done via DSH | Adapter declares policy; host owns retry. |
| Live agent tool cycle | not run | Requires a paid NanoGPT key; fixtures cover the protocol/stream contract. |

## Phase 6 — Settings UI

| Item | Status | Evidence |
| --- | --- | --- |
| Settings entry | done | `settings.section` occupant `nanogpt` and native provider-card occupant `llm-nanogpt`, both active in live Client inspection. |
| Overview + connection + credentials | done | `client.js` implements the full console; loaded in a Node module-loader stub; installed and active. |
| Model browser/detail | done | Server-paginated search/filter/sort, favorite/hide/pin, detail modal, provider list. |
| Reasoning editor | done | Global preference, visibility preference, experimental toggle, real-serializer preview, per-model overrides. |
| Routing/billing/advanced | done | Conflict validation, provider loading, tier/billing/web-search/caching, import/export. |
| Usage/diagnostics/preview | done | Real account reads, settled request facts, redacted serializer preview. |
| EN/RU + theme + accessibility | done | Dictionaries registered (including an optional Russian language), host tokens, accessible controls. Visual browser run pending. |

## Phase 7 — Advanced API features

| Item | Status | Evidence |
| --- | --- | --- |
| Provider selection + routing conflicts | done | `protocols/common.ts`, UI validation, tests. |
| Billing mode / service tier / caching suffixes | done | Protocol tests and the Routing console. |
| Web-search suffix families | done | Config enum, serializer test, Routing console. |
| Reasoning visibility | done | Wire mapper + tests; Messages hide refused. |
| Auxiliary media tools | deferred | ADR-012. |

## Phase 8 — Hardening

| Item | Status | Evidence |
| --- | --- | --- |
| Security audit | delivered | `docs/security-review.md`; findings triaged and fixed where release-relevant. |
| Host contract audit | delivered | `docs/host-review.md`; P1/P2 findings triaged, fixed, or documented. |
| Configuration/preferences normalization | done | `normalizePreferences`; tests. |
| Concurrency/refresh/abort | done | Tests. |
| Memory/performance review | partial | Catalog 647; server pagination and bounded caches; no browser memory profile. |
| Accessibility review | partial | Keyboard/aria controls implemented; real browser audit not run. |

## Phase 9 — Release verification

| Item | Status | Evidence |
| --- | --- | --- |
| Typecheck | done | `npm run typecheck` clean. |
| Unit/contract/integration tests | done | 155 tests, 152 pass, 3 skipped (live gate). |
| Live catalog contract | done | `NANOGPT_LIVE=1` test passed. |
| Package artifact | done | `pack:check` passes: 69 files, secret/docs/runtime checks. |
| Install in profile | done | `install_bundle` applied; row active. |
| Clean uninstall/reinstall | done | `remove_bundle` then `install_bundle` both applied; row/slots active. |
| Live inference/tool cycle | blocked | No NanoGPT API key is configured; must not be claimed. |
| Independent final review | pending | Final consolidated review against the finished artifact. |

## Remaining work queue

1. Integrate the full client console and verify slot/lifecycle behavior.
2. Fix host findings from the independent audits (reasoning precedence,
   protocol edge cases, RPC hardening, lifecycle).
3. Expand tests: manifest/pack, config normalization, full effort matrix,
   route/provider conflicts, catalog offline/failure paths, RPC validation,
   client static checks.
4. Complete required docs and installation instructions.
5. Re-run typecheck/tests/live catalog, pack, reinstall, inspect registration.
6. Independent final review; fix, then report with exact evidence and limits.
