# dsh-nanogpt

A NanoGPT provider and management console for **DeepSeek Harness (DSH)**.
It registers the independent `nanogpt` provider route, discovers the live model
catalog, exposes each exact model's reasoning efforts in DSH's native selector,
streams reasoning/text/tool calls, and adds **Settings → NanoGPT**.

The plugin is a bundle: it installs one Loader row (`llm-nanogpt`) and does not
modify DSH Core.

## What works

- **Live model discovery** from `GET /api/v1/models?detailed=true`, with a
  last-known-good disk cache, background refresh, manual refresh, and exact
  upstream model IDs.
- **Native DSH provider registration** for the `nanogpt` route, including the
  native model picker and the native reasoning-level selector.
- **Per-exact-model reasoning** for `none`, `minimal`, `low`, `medium`, `high`,
  `xhigh`, `max`, and Auto/provider-default. Unsupported levels are rejected
  before HTTP; `xhigh` and `max` stay distinct; `none` is not Auto.
- **Three protocols**: OpenAI Chat Completions (default), OpenAI Responses, and
  Anthropic Messages, with message/tool/history/image conversion and
  protocol-specific reasoning fields.
- **Streaming normalization** into DSH `StreamChunk`s: reasoning, text, multiple
  tool calls, partial arguments, usage, finish reason, replay state, cancellation,
  idle timeout, and classified mid-stream failures.
- **Settings → NanoGPT**: overview, write-only credential management,
  connection test, model browser/detail, reasoning editor, routing/billing,
  usage, diagnostics with request preview, and preference import/export in
  English and Russian. Native theme tokens, keyboard/accessible controls, and a
  compact quick-configuration card on the native Models page.
- **Security**: the browser never receives the API key; credentials resolve
  through the DSH credentials service; provider requests are Host-only; the
  request preview and exports redact secrets; custom endpoints are validated.
- **Tests**: unit, stream fixtures, RPC, catalog-store, real `LlmRuntime`
  contract integration, and free live-catalog contracts.

## Requirements

- DSH `0.2.0-rc.1` or newer (`0.2.0-rc.2` is the verified host).
- Node.js `>= 22.19`.
- A NanoGPT API key for authenticated requests. Public model discovery works
  without a key.

## Install (one command)

Install the tagged source into the `web` profile:

```bash
dsh plugin --profile web add github:Fynth/dsh-nanogpt#v0.1.1
```

Or use the wrapper, which runs the same command and prints the restart reminder:

```bash
curl -fsSL https://raw.githubusercontent.com/Fynth/dsh-nanogpt/main/scripts/install.sh | bash -s -- web
```

Replace `web` with another profile name if needed. DSH loads plugin JavaScript
at process start, so **restart DSH once** after installing (terminal: `Ctrl+C`
then `dsh web`; Desktop: fully quit and reopen). Then verify:

- the Loader row `llm-nanogpt` is active;
- **Settings → NanoGPT** appears in the settings navigation;
- **Settings → Models** shows a NanoGPT provider card;
- the model picker lists discovered `nanogpt` models.

No npm publish is required. The package is a DSH bundle installed from a tarball;
do not edit the profile's `package.json` or `cordis.patch.yml` by hand.

## Build from source

```bash
git clone https://github.com/Fynth/dsh-nanogpt.git
cd dsh-nanogpt
npm install
npm run check          # typecheck, client check, build, unit/contract/integration tests
npm run pack:check     # validates the release artifact contents
```

The release tarball is under `dist/`. For development, install that tarball (or
the package directory through the Plugin Manager); package replacements require
a DSH restart to load a fresh JavaScript module generation.

## First configuration

1. Open **Settings → NanoGPT → Connection**.
2. Enter the NanoGPT API key. It is stored write-only through the DSH credentials
   service under the `NANOGPT_API_KEY` reference; the page never reads it back.
3. Press **Test connection**. The test uses an authenticated account endpoint and
   reports authentication separately from public-catalog reachability.
4. Open **Models**, refresh/search/filter, and open a model to review its exact
   id, capabilities, pricing, and reasoning levels.
5. Use **Use as default** to save the DSH default model for new sessions, or use
   the native composer model selector and its effort pane.
6. Open **Reasoning** to set the user default effort/visibility; the native
   selector remains the per-session control.
7. Open **Routing & billing** for documented provider routing, cache-capable
   routing, billing mode, service tiers, web search, and prompt caching.
8. Open **Usage** (balance/subscription) and **Diagnostics** (request facts and a
   sanitized request preview) as needed.

### Deployment configuration

Connection facts and deployment-level controls live in the Loader row Config
(`Settings → Plugins` or the profile's `cordis.patch.yml`). Typical fields:

```yaml
- id: llm-nanogpt
  name: dsh-nanogpt
  config:
    apiKeyEnv: NANOGPT_API_KEY
    baseURL: https://api.nano-gpt.com/api/v1
    protocol: chat
    defaultModel: deepseek/deepseek-v4.1-flash-1017
    autoRefresh: true
    refreshMinutes: 360
```

The API key itself is never written into the patch. Use the credential editor.
See [docs/installation.md](docs/installation.md) and
[docs/configuration.md](docs/configuration.md) for every field.

## Reasoning contract

| Selection | Chat Completions | Responses | Anthropic Messages |
| --- | --- | --- | --- |
| Auto / omitted | no effort field | no effort field | no `output_config` |
| `none` | `reasoning_effort: "none"` where legal | `reasoning.effort: "none"` | `thinking: {type: "disabled"}` |
| `minimal`/`low`/`medium`/`high` | `reasoning_effort` | `reasoning.effort` | `output_config.effort` |
| `xhigh` | `reasoning_effort: "xhigh"` | `reasoning.effort: "xhigh"` | `output_config.effort: "xhigh"` |
| `max` | `reasoning_effort: "max"` | `reasoning.effort: "max"` | `output_config.effort: "max"` |
| hide output | `reasoning.exclude: true` | `reasoning.exclude: true` | not documented; warning, output remains visible |

Unsupported levels are refused by DSH before provider I/O and re-checked by the
adapter. `hide` never disables reasoning computation. See
[docs/reasoning-compatibility.md](docs/reasoning-compatibility.md).

## Verified and unverified

The free live catalog and provider-discovery contracts were exercised against
`api.nano-gpt.com` (647 chat models at the time of verification). A user-provided
key was then stored through the DSH credentials service and a budgeted live
smoke run was completed: **21/21 checks passed**, including connection/account
reads, all seven reasoning efforts plus Auto, hidden-reasoning output, Responses,
Messages, a Chat tool call with continuation, vision, and a stream through the
native DSH `LlmRuntime` prepare/stream path. The requests used subscription-included
models; the account's usage endpoint reported `netCostUsd: 0` for the smoke
window, with USD/XNO balance 0 and an active subscription. This is not a claim
that every model is free or that a different account will have the same coverage.

The default test suite still uses fixtures and makes no paid requests. The
manual smoke is [tests/live/smoke.mjs](tests/live/smoke.mjs) and is run with
`NANOGPT_API_KEY=... npm run test:smoke`. A real browser visual/accessibility
run and a paid non-subscription model matrix remain unverified. See
[docs/verification-matrix.md](docs/verification-matrix.md).

## Known limitations

- One `nanogpt` route/profile per DSH installation; concurrent rows would
  collide on the route id.
- Mid-conversation inline reasoning-effort updates are not synthesized; DSH does
  not expose the ordered replay representation needed to place them safely.
- A pinned upstream route's `maxInputTokens` and route price are shown in the
  model/provider detail but are not enforced as a token-budget or cost cap;
  there is no tokenizer in the adapter.
- Legacy `off` is translated to `none` by the wire mapper, but current DSH
  validates the selection against advertised efforts before dispatch, so an old
  session header containing literal `off` is rejected rather than silently
  reinterpreted.
- Auxiliary NanoGPT image/video/audio/embedding endpoints are not added as DSH
  tools in this release; the provider surface is the text/multimodal LLM route.
- Anthropic Messages has no documented hide-only reasoning control in this
  integration, so `hide` is not applied there (a warning is recorded).
- Custom endpoints are deployment configuration. Browser draft discovery is
  restricted to the configured origin to avoid opening an SSRF surface.
- A custom hostname that resolves to a private address is a residual SSRF risk
  for deployments that opt into a private endpoint policy; DNS is not re-checked
  at request time.

## Documentation

- [Architecture](docs/architecture.md)
- [Installation and configuration](docs/installation.md)
- [Configuration reference](docs/configuration.md)
- [NanoGPT API compatibility](docs/api-compatibility.md)
- [Reasoning compatibility](docs/reasoning-compatibility.md)
- [Implementation plan and status](docs/implementation-plan.md)
- [Verification matrix](docs/verification-matrix.md)
- [Decisions](docs/decisions.md)
- [Security review](docs/security-review.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Host contract review](docs/host-review.md)

## License

MIT. See [LICENSE](LICENSE).
