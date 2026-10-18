# Architecture decisions

Statuses: **accepted** (implemented), **accepted-with-limitation** (implemented
with a documented constraint), **open** (needs evidence or work).

## ADR-001 — One independent adapter, not a pi-ai provider profile

**Status:** accepted.

NanoGPT is registered as its own `nanogpt` route with a dedicated
`LlmAdapter`. The native Models page can also list it through
`registerConfigurableProviders`, but the route does not depend on another
adapter's provider schema or model namespace.

**Why:** the plugin needs exact model capability discovery, three protocols,
route-specific effort ladders, and model-specific serialization that a generic
gateway profile cannot express. It also avoids a second package owning the
route's lifecycle and credentials.

**Alternative rejected:** declare NanoGPT as an `llm-pi-ai` custom provider.
That would lose exact reasoning metadata and the independent settings page.

## ADR-002 — Exact provider IDs are never rewritten

**Status:** accepted.

The outgoing request model is always the catalog/deployment id exactly as
discovered (for example `deepseek/deepseek-v4.1-flash-1017`). Display names are
a separate field. Routing, caching, web-search, and thinking suffixes are
applied only where the model/protocol rules allow them, and the unsuffixed id
is preserved whenever a body/header field expresses the same choice.

**Why:** NanoGPT routes on its own model ids; rewriting them into another
namespace changes the product and breaks billing/routing.

## ADR-003 — Three protocols, selected per model, with deployment default

**Status:** accepted-with-limitation.

Chat Completions is the default. Responses and Anthropic Messages are
selectable globally or per model. Protocol is pinned for an established
conversation; switching mid-conversation is not attempted because replay state
and tool-call shapes differ.

**Limitation:** DSH exposes no per-turn protocol choice in `GenerateOptions`
beyond the adapter's own configuration, so changing a model's protocol mid
session is a user action with the normal model-switch consequences, not a
transparent translation.

## ADR-004 — Reasoning capability is resolved per exact model and route

**Status:** accepted.

Resolution order currently implemented:

1. explicit per-provider-route facts from NanoGPT provider discovery;
2. the API catalog's `reasoning_efforts` ladder;
3. model-specific documented policy (only when the API is silent);
4. an explicit deployment/user override;
5. clearly labelled experimental inference — only when enabled;
6. unknown.

An override that differs from the API keeps the API ladder visible in
`unverifiedLevels` and is labelled experimental; it never silently pretends a
level is verified. Generic `capabilities.reasoning: true` yields only
provider-default selection unless a ladder is known.

**Known tension:** AGENTS.md lists user overrides after documentation and
verified records but before inference. The implementation lets an explicit
override take precedence over a documented ladder because it is the user's
explicit correction. This is a deliberate deviation; it is surfaced in the
model detail as “user override” with unverified levels, and the API ladder is
still retained in the notes. A future revision can change precedence if the
product wants the catalog to win.

## ADR-005 — `auto` is an adapter-owned selection, distinct from `none`

**Status:** accepted.

DSH's `LlmModelReasoningInfo` has no dedicated “omit” effort. The adapter
offers an `auto` effort id when a concrete default exists, maps `auto` and an
omitted effort to “do not send an effort field”, and never sends the literal
string `auto` or `off`. `none` is sent only where the model/route advertises
it; `off` is a legacy alias that requires the same legality check.

When DSH materializes a `defaultEffort`, the adapter sends that concrete effort.
The native selector's provider-default choice remains available whenever the
adapter advertises no default.

## ADR-006 — `xhigh` and `max` remain distinct

**Status:** accepted.

No clamping/aliasing exists in the adapter. DSH Core itself rejects an effort
not present in the advertised list before provider I/O; the adapter
re-validates as defense in depth. Tests cover every protocol and every value.

## ADR-007 — Hiding reasoning does not disable it

**Status:** accepted.

`reasoningVisibility: hide` adds the documented protocol exclusion field
(`reasoning.exclude: true` for Chat/Responses) while leaving the selected
effort untouched. Anthropic Messages has no documented hide field in the
supported surface, so the adapter omits a hide field on Messages and records a
warning rather than inventing a suffix or body parameter. The setting is
therefore a transport/rendering choice, never a compute choice.

## ADR-008 — Versioned preferences file separate from deployment Config

**Status:** accepted.

Deployment facts (base URL, credential reference, protocol defaults, retry
policy, endpoint safety) live in the Cordis row Config and survive upgrades.
User choices (favorites, hidden/pinned models, per-model effort/protocol/
routing/advanced overrides, UI state) live in a versioned JSON document under
the harness home with revision-guarded atomic writes and normalization on load.
No credentials are ever written there.

**Why:** the native settings document is deployment/profile state; a provider
console needs high-frequency user choices and optimistic concurrency without
rewriting the profile patch. Export/import is secret-free.

## ADR-009 — Catalog is dynamic with last-known-good cache

**Status:** accepted.

The catalog is never a hardcoded model list. `GET /models?detailed=true`
populates it; the last good snapshot is cached, served immediately on boot,
and refreshed in the background. A failed refresh keeps the snapshot and
records the error. Concurrent refreshes share one attempt. A removed model is
not claimed to remain available: the next successful snapshot replaces the
catalog atomically, and unknown/manual ids are supported only when the user
declares them.

## ADR-010 — Browser UI is a plain Client plugin over a Host RPC channel

**Status:** accepted.

The UI is `client.js` registering one `settings.section`; it has no Harness
package imports and uses only React from the browser module table. The Host
mounts `/nanogpt` on DSH Connection and validates every payload. The browser
receives no credential value and cannot select an arbitrary provider endpoint.

**Why:** this is the installed DSH extension mechanism, keeps the bundle
installable without a frontend build step, and keeps all provider I/O on the
Host.

## ADR-011 — Retries belong to DSH Core, not the adapter

**Status:** accepted.

The adapter declares `providerRetryPolicy` from Config (normal mode, retryable
codes, backoff). DSH's `llm-retry` row performs retries. The adapter never
replays a request after any streamed output or an ambiguous paid dispatch. A
429/`retry-after` is classified with provider facts so the host policy can act.

## ADR-012 — Auxiliary media tools are out of scope for the LLM provider row

**Status:** open/deferred.

NanoGPT exposes image/video/audio/embedding endpoints, but DSH's current
provider row is a text/multimodal LLM adapter. Adding separate tools would
require a second, independently reviewed surface and cost/async-job UX. The
shared HTTP, credential, and diagnostics infrastructure is reusable, but no
auxiliary tool is claimed as implemented in this release.

## ADR-013 — Inline mid-conversation effort updates are not synthesized

**Status:** accepted-with-limitation.

NanoGPT documents an inline effort-update mechanism for certain models. DSH
preserves ordered messages and adapter replay envelopes, but it has no
first-class per-turn effort/configuration-update representation, and this
adapter does not store the effort used on each assistant turn. A faithful replay
would therefore require new adapter-private state and careful synthesis. The
plugin uses the standard per-request effort field, documents the limitation, and
never rewrites historical metadata to fake an inline update.

## ADR-014 — No global DSH changes

**Status:** accepted.

The bundle only inserts its own row. It does not patch DSH Core, replace the
settings shell, or re-register another provider's route. The native Models
page integration uses the documented configurable-provider/model-discovery
seams. A profile-level patch is never written by the plugin.
