# Changelog

## 0.1.1 — 2026-10-18

### Verified

- Budgeted live smoke against the real NanoGPT API with 21/21 checks passed:
  connection, balance/usage/subscription, provider discovery, all seven
  reasoning efforts plus Auto, hidden reasoning, Responses, Messages, Chat tool
  call + continuation, vision, native DSH `LlmRuntime` prepare/stream, and
  invalid-key classification.
- Requests used subscription-included models; the account reported
  `netCostUsd: 0`, USD/XNO balance 0, and an active subscription.

### Fixed / hardened

- Release artifact now installs from a tarball; package version bumped.
- Regression coverage added for `agnes-3.0-flash` and other undisclosed
  reasoning ladders (Auto-only metadata; never empty efforts).
- Live smoke covers legacy `off` → `none`, hide, tool images, and the native
  runtime path.
- Non-SSE JSON 200 responses are rejected as `MALFORMED_RESPONSE`; streaming
  sends `Accept: text/event-stream`.
- Catalog refresh aborts on disposal and invalidates on a `baseURL` change.
- Account endpoints send both documented auth schemes and parse string balances
  and top-level subscription quotas.
- Additional documented web-search suffixes (`online/sofya`, `online/valyu*`)
  and reserved `extraBody` keys.

## 0.1.0 — 2026-10-18

Initial release.

### Added

- Independent `nanogpt` LLM provider route for DSH 0.2.0-rc.2.
- Live detailed model catalog with disk cache, stale-while-revalidate refresh,
  manual refresh, concurrent-refresh dedupe, change detection, and safe offline
  fallback.
- Exact per-model reasoning resolution for `none`, `minimal`, `low`, `medium`,
  `high`, `xhigh`, `max`, and Auto/provider-default, including always-thinking
  and route-specific ladders.
- Native DSH reasoning metadata (`LlmModelReasoningInfo`) and per-request wire
  mapping for Chat Completions, Responses, and Anthropic Messages.
- Streaming translator with reasoning, text, tool calls, usage, replay state,
  cancellation, idle timeout, and non-retryable partial-output failures.
- Authenticated Host RPC channel for the Settings console.
- Write-only credential management, authenticated connection test with separate
  public-catalog reachability, usage/balance/subscription reads, diagnostics, and
  a real-serializer request preview.
- Settings → NanoGPT console with overview, models, model detail, reasoning,
  routing/billing, usage, diagnostics, advanced controls, EN/RU, and a quick
  configuration card on the native Models page.
- Versioned preferences store with atomic writes, revision checks, import/export,
  prototype-pollution guards, and secret exclusion.
- Unit, contract, and integration tests, including real `LlmRuntime` provider
  metadata/effort validation.
- Documentation set and release-artifact checks.

### Security

- Provider error text is redacted and bounded before logs/diagnostics.
- Browser draft discovery is restricted to the configured NanoGPT origin.
- Private/loopback IPv4/IPv6 endpoint validation, including IPv4-mapped and
  unspecified addresses.
- Reserved `extraBody` fields cannot override reasoning, routing, store/include,
  authorization, or runtime keys.
- Model ids used in URL paths reject empty/dot segments and control characters.
- SSE line/event buffers are bounded.

### Known limitations

- No paid live inference/tool-cycle verification in this environment.
- Anthropic Messages has no documented hide-only reasoning control; hide is not
  applied there and records a warning.
- Inline mid-conversation effort updates are not implemented.
- Auxiliary media generation tools are not part of this release.
