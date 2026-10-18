# Final release review

**Verdict: release-ready with documented limitations.** No open P0 or P1 defect
was found by the independent host audit after the late hardening pass. The
artifact builds, passes 155 tests (152 pass, 3 live-gated skips), passes the
release-file/secret check, installs as an active DSH bundle, registers both the
Settings page and the native Models-page card, and mounts its RPC route behind
Connection authentication.

This review consolidates the independent host audit
([host-review.md](host-review.md)), the security review
([security-review.md](security-review.md)), the live free-endpoint checks, the
budgeted live smoke (21/21 checks on subscription-included models), and the
integration-owner checks below. It does not claim a paid non-subscription matrix
or a visual browser E2E run.

## Confirmed

- Native `nanogpt` route: registration, disposal, exact model ids, alias id
  echo, model listing, exact-model resolution, and DSH reasoning metadata were
  exercised through the real installed `LlmRuntime`.
- Unknown reasoning ladders produce an Auto-only DSH metadata object instead of
  the empty `efforts` array the Core rejects; the full 647-model live catalog
  builds with 0 failures (155 Auto-only models).
- All seven efforts plus Auto are serialized correctly across Chat, Responses,
  and Messages; `xhigh` and `max` remain distinct; `none` is not Auto; always-
  thinking models cannot be disabled before HTTP.
- Chat hides with `reasoning.exclude`; Responses hides with
  `reasoning.exclude`; Messages omits an undocumented hide control and records a
  warning. Hide never changes compute.
- Caching/routing combination rules follow the live docs: Chat allows body
  caching with a routing sort; suffix transports reject the conflicting suffix
  combination; explicit provider + caching is rejected everywhere.
- A pinned provider is resolved only for the actual request (no 647-request
  fan-out during catalog build); route output/tool/image/caching facts are
  enforced before HTTP, and the provider id must be publicly listed.
- Streaming block invariants, tool arguments, usage, replay state, cancellation,
  idle timeout, and partial-output retry safety are covered by tests.
- Tool-role images are preserved (native on Messages/Chat, deterministic handle
  on Responses) rather than dropped.
- Credential handling is Host-only and write-only; preview/diagnostics/exports
  redact secrets; provider text is redacted and bounded.
- Browser draft discovery is restricted to the configured origin; private and
  IPv4-mapped/unspecified endpoints are rejected.
- Catalog cache restores across restart and is endpoint-matched; failed
  refreshes keep the last good catalog; in-flight refreshes abort on disposal.
- Preferences are versioned, revision-checked, size/entry bounded, secret-free,
  prototype-key safe, and corrupt documents are preserved before fallback.
- Bundle uninstall + reinstall both applied; `llm-nanogpt` is `active`;
  `settings.section` and `settings.models.provider-card` occupants are active;
  unauthenticated `/nanogpt/status` returns 401.
- `npm run check:client` type-checks the plain-JavaScript client module with
  ambient React/module-loader declarations, catching undefined identifiers.

## Residual P2 limitations

- Legacy literal `off` is mapped to `none` by the serializer, but current DSH
  validates selections against advertised efforts before dispatch, so an old
  session header containing `off` is rejected rather than silently rewritten.
- Pinned-route `maxInputTokens`/pricing are displayed but not enforced as a
  budget/cost cap (no tokenizer); a route-unsupported effort fails in
  `prepare`, after the native selector's model-wide choice.
- Reasoning overrides intentionally precede the API ladder and are labelled
  unverified; this is a documented deviation from the strict AGENTS priority
  order.
- Volatile deployment edits are read per request, but a `baseURL` change
  invalidates the old catalog on the next capture/refresh; `displayName` is live.
  Some settings changes may need a page/model-selector refresh.
- The native Models page treats the plugin namespace as an unknown editor
  family; the plugin's own quick card and full settings page provide the real
  controls.
- Messages web-search/provider routing suffixes and `minimal` effort are
  implemented per the general suffix reference but not verified against a live
  Messages request.
- Optional scope absent: multiple simultaneous profiles, auxiliary media tools,
  inline effort updates, cost guards, structured-output UI, legacy/merged Chat
  base paths, image-request pricing/budget integration.
- A live key was stored through DSH credentials and a smoke run passed 21/21
  checks (account reads, all seven efforts, Auto, Responses, Messages, tool
  call/continuation, vision, invalid key). The requests used subscription-included
  models and the account usage endpoint reported `netCostUsd: 0`; a paid
  non-subscription matrix, process restart, and browser visual/accessibility run
  remain unverified.

## Release evidence

- `npm run typecheck`, `npm run check:client`, `npm run build` — pass.
- `npm test` — 155 tests, 152 pass, 0 fail, 3 skipped (live gate).
- `NANOGPT_LIVE=1 npm run test:live` — 3 pass: 647 chat models, 11
  provider routes, and 647 models resolved through the real `LlmRuntime` with 0
  failures (155 Auto-only).
- `npm run pack:check` — 70 files, ~177 KB compressed; required runtime/docs and
  secret checks pass.
- Live profile: `include:llm-nanogpt` active; Settings/Models slots active;
  unauthenticated RPC 401.
