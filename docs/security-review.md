# Security and reliability review

This is the release security summary for `dsh-nanogpt` against DSH 0.2.0-rc.2.
It records the controls verified in the current tree, the findings fixed during
hardening, and the residual risks that remain deployment responsibilities.

## Threat model

Assets: the NanoGPT API key, account balance/usage data, local prompts and tool
results, request history, and the provider route's availability/cost profile.
Trust boundaries:

- the authenticated DSH Web browser → the Host `/nanogpt` RPC channel;
- the Host → the configured NanoGPT origin (and its account/provider endpoints);
- untrusted JSON/SSE from a provider or custom endpoint → the adapter/UI;
- the plugin → DSH Core, the credentials service, the filesystem cache/preferences.

## Verified controls

### Credential lifecycle

- The API key is resolved on the Host through the DSH credentials service, with
  a process-environment fallback; the browser never receives a value.
- `credential/set` is write-only. `credential/status` returns booleans, the
  reference name, and a source label only. `credential/remove` unsets the
  reference.
- The key is never placed in a URL, the request preview (Authorization is
  replaced with `Bearer <redacted>`), diagnostics, preference exports, or
  provider-discovery drafts.
- `assertUsableApiKey` rejects blank/control-character values before an HTTP
  header is built.
- Account requests send both documented schemes (`Authorization: Bearer` and
  `x-api-key`) to the same configured origin; no other host receives the key.
- A browser-supplied draft discovery key is accepted only when the request
  targets the configured origin; a different origin is refused before fetch.

### Endpoint safety

- The default endpoint is `https://api.nano-gpt.com/api/v1`.
- Custom endpoints require a parseable `http`/`https` URL, no embedded
  credentials, no query/fragment, and explicit opt-in for private or insecure
  hosts. Redirects are disabled (`redirect: 'error'`).
- Private detection covers IPv4 loopback/private/link-local/CGNAT/unspecified,
  IPv6 loopback/unspecified/unique-local/link-local, and IPv4-mapped IPv6 forms.
- Model ids placed in provider-discovery URL paths reject empty/dot segments,
  control characters, and URL delimiters.
- Browser model-discovery drafts are restricted to the configured origin; the
  fetch always uses the configured base path.

### RPC surface

- The `/nanogpt` channel is mounted only through DSH Connection; unauthenticated
  `POST /nanogpt/status` returns 401, and cross-origin requests are subject to
  Connection's Host/Origin fence.
- Every endpoint validates and bounds its payload: strings, integers, ranges,
  unknown endpoints, model ids, revisions, preference patches, credential values,
  and diagnostic reads. Unknown endpoints return a classified failure.
- Preference writes use monotonic revisions; stale writes are refused and the UI
  reloads. Model ids that could mutate an object prototype are refused on read
  and write. Import rejects secret fields and oversized documents.
- Provider errors are redacted of bearer/key-shaped material and bounded before
  they reach a log, diagnostic, RPC reply, or error message.

### Runtime and data handling

- Tool calls are normalized into DSH `tool-call` blocks; malformed streamed
  arguments become a controlled `MALFORMED_TOOL_ARGUMENTS` failure, never raw
  executable text. DSH remains the only executor and permission authority.
- Tool-role images are projected (native image block on Messages, image content
  on Chat, deterministic placeholder on Responses) instead of being dropped.
- `extraBody` refuses reserved serializer/runtime fields (`reasoning`,
  `reasoning_effort`, `thinking`, `output_config`, `provider`, routing,
  store/include/prompt-cache keys, output caps, authorization, and prototype
  keys).
- SSE parsing is byte-boundary safe, cancellation-aware, idle-timeout aware, and
  bounded per line/event. A mid-stream failure after any emitted output is
  reported as non-retryable `STREAM_INTERRUPTED`; a silent stream after output is
  treated the same way. This prevents duplicate paid work and merged partial
  answers.
- The catalog cache and preferences are written atomically with restrictive
  modes, bounded, endpoint-matched (cache), revisioned, and validated on load. A
  malformed preferences document is renamed aside before defaults are used.
- The browser bundle uses only React from the DSH module table, has no harness
  package imports, no local/session storage, no cookies, no `eval`/`new Function`,
  and no unsafe HTML injection.

## Findings fixed during hardening

| Area | Finding | Resolution |
| --- | --- | --- |
| Catalog cache | Cache was written with the full models URL but read against the base URL, so the offline cache never restored. | Load compares the normalized models endpoint; round-trip test added. |
| Discovery SSRF | A browser draft endpoint could target a private/insecure host even without a key. | Drafts are restricted to the configured origin; private IPv4-mapped/`::` hosts rejected. |
| Error leakage | Provider error text could echo a bearer/key fragment. | Redaction + length bound before diagnostics/UI/logs. |
| Retry safety | Idle timeout after partial output was classified retryable `TIMEOUT`. | Partial-output idle becomes `STREAM_INTERRUPTED`; test added. |
| Preferences | Prototype keys could mutate a model record; oversized/corrupt documents could overwrite. | Reserved-id checks, size caps, corrupt-file preservation. |
| Schema defaults | Parsed model overrides materialized empty arrays and default routing/advanced, failing mount or resetting globals. | Empty means inherit; partial overrides compacted and deep-merged. |
| Tool images | Tool-role image blocks were silently dropped. | Protocol-specific projection/placeholder. |
| Streaming bounds | SSE line/event buffers were unbounded. | 4 MiB/16 MiB limits with controlled failure. |
| Usage/account | Balance strings/snake_case and subscription top-level quotas were missed; 402 was misclassified. | Numeric-string parsing, top-level quotas, shared `httpFailure`. |

## Residual risks and limitations

1. **DNS rebinding for a custom hostname.** Endpoint validation is literal-based;
   a deployment that opts into a private endpoint can point at a hostname that
   resolves to a private address. This is deployment configuration, not
   browser-controlled discovery. Resolve/re-check at request time if the threat
   model includes hostile DNS.
2. **Redaction is heuristic.** It targets bearer/key-shaped patterns; a provider
   that encodes a secret in an unrecognized format could still leak text. Prompt
   bodies are never captured in diagnostics by default.
3. **Account auth compatibility.** The public API advertises two auth schemes;
   sending both maximizes compatibility but a custom gateway may reject one.
   Account reads are opt-in UI actions, not required for inference.
4. **Local preference/cache files are not encrypted.** They contain no secrets,
   are mode 0600, and are protected by the user's filesystem permissions.
5. **Live smoke completed, browser E2E not.** A user-provided key was stored
   through DSH credentials and a budgeted smoke passed 21/21 checks on
   subscription-included models (account reads, efforts, protocols, tool
   continuation, vision, invalid-key classification). Credential survival across
   a real process restart and browser visual/accessibility remain unverified; see
   [verification-matrix.md](verification-matrix.md).
6. **Messages reasoning-hide is warning-only** because NanoGPT does not document
   a control for that transport. The setting is correctly not represented as
   effective there.
7. **Pinned-route input capacity/cost** are displayed but not enforced; there is
   no tokenizer in the adapter, and route-specific pricing is informational.

## Verification log

```bash
npm run typecheck
npm run check:client
npm run build
npm test
NANOGPT_LIVE=1 node --test tests/contracts/live-catalog.test.mjs
npm run pack:check
```

- Unit/contract/integration: 155 tests, 152 pass, 3 live-gated skips.
- Live public catalog: 647 chat models; provider discovery: 11 routes.
- Live smoke (subscription-included models): 21/21 checks passed; usage
  `netCostUsd: 0`.
- Unauthenticated `POST /nanogpt/status` → 401.
- No P0/P1 finding remained open at the final host audit; this document records
  the fixed security-relevant findings and the residual deployment risks above.
