# Troubleshooting

## The NanoGPT provider row is active but no models appear

- Open **Settings → NanoGPT → Overview**: the catalog card shows `status`,
  `chatModels`, the last fetch, and any retained refresh error.
- Press **Refresh catalog**. Public discovery does not need a key; if it fails,
  check DNS/proxy/connectivity to the configured `baseURL`.
- If a cache exists but is stale, it keeps serving while the background refresh
  retries. A failed refresh never clears the last known good catalog.
- With `autoRefresh: false`, only manual refresh (or a restart with a cache) adds
  models. The model selector is notified after the cache and preferences load
  and after a manual refresh.

## The model picker shows fewer models than the catalog

Hidden, disabled, and retired/decision-only records are filtered. Use
**Models → Show hidden** to inspect hidden ids, and clear the hide flag in the
model detail. The catalog excludes `-decisions` records from the chat catalog.

## Connection test says invalid key

- The test uses authenticated account endpoints, not the public model catalog.
  A public catalog success alone is not treated as authentication.
- Replace the key in **Connection**; the saved value is write-only.
- A 403 can also mean a network/proxy rejected the request before NanoGPT. The
  classified `message` distinguishes auth, timeout, network, rate-limit,
  endpoint, and balance/quota cases.
- The Host sends both `Authorization: Bearer` and `x-api-key` on account reads
  for compatibility with the public API's two auth schemes.

## Requests fail with `MISSING_CREDENTIAL`

The credential reference named by `apiKeyEnv` could not be resolved from the
managed credential store or the process environment. Set it in **Connection** or
export the reference in the DSH process environment. The adapter refuses before
network I/O.

## “reasoning cannot be disabled for this model”

The model/route is always-thinking or does not advertise `none`. Do not send
`off`; DSH will not accept it. Choose a supported level or Auto. The model detail
shows `alwaysThinking`/`supportsDisable` and the exact offered ladder.

## “model does not support reasoning effort …”

The selected level is not in the exact model's advertised ladder. Options:

- choose provider default/Auto (omit the effort);
- select an offered level;
- if the catalog is wrong or silent, add an explicit `models[]` override or use
  the experimental toggle, accepting that unverified levels may fail at the
  provider;
- `xhigh` and `max` are distinct; a model that supports only one will reject the
  other.

## Hiding reasoning did not seem to disable it

That is expected. `reasoningVisibility: hide` removes the output representation,
not the computation. On Anthropic Messages this integration does not send a hide
control because NanoGPT does not document one for that transport; a warning is
recorded and reasoning remains visible. Use Chat Completions/Responses when you
need hide.

## Messages requests fail while Chat works

NanoGPT's Anthropic Messages transport has narrower parameter support. This
plugin:

- requires `max_tokens` (falls back to the catalog output cap, then 4096, with a
  warning);
- maps stop sequences to `stop_sequences`;
- omits temperature/top_p when reasoning is active;
- appends routing/web-search suffixes where documented;
- refuses transport-incompatible service tiers with an actionable message.

Switch the model's protocol to Chat Completions if the model is not documented
for Messages.

## Routing conflict

- Explicit provider + cache-capable routing is refused (choose one).
- Sticky routing requires cache-capable routing.
- A routing goal and an explicit provider are mutually exclusive.
- Pinned provider ids must come from `GET /api/models/:id/providers`, not be
  guessed from the model family.
- Service tiers are transport-specific; see
  [configuration.md](configuration.md#protocol-and-routing).

## “Use as default” did not change new sessions

The action calls DSH's `agentDefaultModel.saveSelection`. If the deployment has
no default-model service or no configuration editor, the call returns an
`unavailable` failure or `persisted: false`; the UI reports it. Set
`agent-default-model` in the profile patch as a deployment fallback. Existing
sessions keep their already-recorded selection by design.

## Preferences changed concurrently

The preferences document is revisioned. A stale write is refused, the UI reloads
the latest state, and you can retry. Do not edit the JSON file while another
window is saving.

## Preferences file is corrupt

A malformed file is renamed to `preferences.json.corrupt-<timestamp>` before the
plugin falls back to defaults, so the original bytes are preserved for recovery.
The next successful write creates a fresh document.

## The native Models page shows an “advanced settings” hint for NanoGPT

The native Models page's provider editor is hand-written for its shipped
adapter families. NanoGPT adds its own functional quick-configuration card in
that slot (write-only key, save, test), and the full console is under
**Settings → NanoGPT**. The native hint is not an error.

## “NanoGPT failed to load: adapter returned invalid reasoning metadata”

This is a known DSH module-generation symptom when the running process still has
the pre-fix plugin loaded after a package replacement. The current artifact
(v0.1.1) handles models with an undisclosed reasoning ladder by advertising
Auto-only metadata; a fresh process resolves all 647 live models with 0
failures, including `agnes-3.0-flash`. DSH documents that package replacements
require a process restart to load a fresh JavaScript generation.

Fully quit/restart DSH, then hard-refresh the page (or press Retry in the model
picker). Verify **Settings → NanoGPT → Connection** still shows the stored key.
Do not hide the model or edit the catalog as a workaround.

## Debugging provider failures

- **Diagnostics** lists settled requests with model, protocol, requested vs
  actual wire effort, status, duration, request id, token usage, and a
  content-free failure. Prompt bodies are not captured.
- **Request preview** runs the real serializer and shows endpoint, protocol,
  effort, warnings, redacted headers, and body.
- Provider error text is redacted of bearer/key-shaped material and bounded
  before it reaches the UI or logs.
- Stream failures after partial output are reported as `STREAM_INTERRUPTED` and
  are deliberately not retried, to avoid duplicate paid work and merged
  partial answers.
