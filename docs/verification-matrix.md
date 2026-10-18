# Verification matrix

Legend: **verified** — an executed probe/test proves it; **partial** — the
implemented contract is tested but the end-to-end user path is not; **blocked**
— requires an unavailable external resource (paid NanoGPT key or browser
automation); **not run**.

A user-provided key was stored through the DSH credentials service and a
budgeted live smoke was run on subscription-included models. The account's usage
endpoint reported `netCostUsd: 0` for the smoke window; this is not a claim that
every model is free or that a different account has the same coverage. A paid
non-subscription matrix and a browser visual/accessibility run remain
unverified.

## Commands and results

```bash
cd /home/rasul/Projects/dsh-nanogpt
npm run typecheck          # clean
npm run build              # clean
npm test                   # 155 tests, 152 pass, 3 skipped (live gate)
NANOGPT_LIVE=1 npm run test:live
                           # 3 pass: 647 chat models; 11 provider routes;
                           # 647 models resolve through the real LlmRuntime, 0 failures, 155 Auto-only

NANOGPT_API_KEY=... npm run test:smoke
                           # 21/21 live checks passed (subscription-included models,
                           # account usage netCostUsd 0)
npm run pack:check         # 69 files, 173843 bytes compressed, secret/docs checks passed
node --check client.js     # syntax OK
```

The Client module was loaded in Node with a stubbed module loader and React
surface; it returned `{inject, apply}` and `apply` registered both
`settings.section` (id `nanogpt`) and `settings.models.provider-card` (key
`llm-nanogpt`) without throwing. The installed page is not rendered by an
automated browser; see the limitation below.

## Installation evidence

- `plugin_manager install_bundle` → `application: applied`.
- `plugin_manager list_plugins` → `include:llm-nanogpt`, module `dsh-nanogpt`,
  enabled, `fiberPhase: active`.
- `Config.listConfigs` name `dsh-nanogpt` → one schema-bearing entry.
- Client slot inspection:
  - `settings.section` occupant `nanogpt`, order 14, active.
  - `settings.models.provider-card` occupant key `llm-nanogpt`, active.
- Clean uninstall + reinstall was exercised:
  - `remove_bundle` → applied.
  - `install_bundle` from the same directory → applied.
- `POST http://127.0.0.1:3080/nanogpt/status` without a browser session → HTTP
  401 `unauthorized`, proving the custom RPC route is mounted behind DSH
  Connection's authentication.

## Acceptance scenarios

| # | Scenario | Status | Evidence / gap |
| --- | --- | --- | --- |
| A | Fresh installation, no core modification | verified | One inserted Loader row; install applied; active row; no DSH source changes. |
| B | API key entered, saved securely, survives restart | verified (storage), partial (restart) | Live key stored through DSH credentials (mode 0600) and authenticated connection test passed; a process restart with the key was not performed. |
| C | Dynamic discovery, exact IDs in picker | partial | Live catalog 647 chat models; adapter `listModels`; native picker visibility not visually confirmed. |
| D | New upstream model appears after refresh | partial | Refresh replaces the snapshot atomically; change detection tested; no upstream addition occurred during the window. |
| E | Select `high`, outbound request uses `high` | verified live | Live smoke asserted the serialized `reasoning_effort: "high"` and a streamed answer on an included model. |
| F | Select `xhigh`, outbound uses `xhigh` | verified live | Live smoke asserted `reasoning_effort: "xhigh"` and a streamed answer. |
| G | Select `max`, outbound uses `max` (not `xhigh`) | verified live | Live smoke asserted `reasoning_effort: "max"` and a streamed answer. |
| H | Select `minimal` via body field | verified live | Live smoke asserted `reasoning_effort: "minimal"` and a streamed answer. |
| I | Auto omits effort | verified live | Live smoke sent no effort field and streamed an answer. |
| J | Always-thinking cannot disable | verified at capability/adapter level | Resolver removes `none`; adapter rejects before HTTP. |
| K | Hide reasoning does not disable compute | verified live (Chat) | Live `reasoningVisibility: hide` request sent `reasoning_effort: high` plus `reasoning.exclude: true`, streamed no reasoning deltas, and still answered. Messages remains warning-only. |
| L | Tool call + continuation | verified live (adapter) | Live Chat request produced a tool call; a second request with the assistant tool call and tool result produced the final answer. Native DSH agent UI flow not browser-driven. |
| M | Streaming reasoning/text/tools without corruption | verified live (adapter) + unit | Live Chat/Responses/Messages streams yielded reasoning and text; Chat tool call and continuation worked; unit tests cover parser edges. |
| N | Model switch reconciles saved effort | partial | Preferences/default resolution tests; native client code inspected; no browser run. |
| O | Restart restores settings | partial | Preferences round-trip and corrupt-file preservation tested; real restart not run. |
| P | Missing network keeps cached info | partial | Catalog failure retention/offline cache tested; UI error state implemented but not visually run. |
| Q | Invalid credential not reported as public-catalog success | verified live | Live `testConnection` with a deliberately invalid key returned `invalid-key`, not connected. |
| R | Routing conflict prevented | verified | Cache-capable routing + any goal/provider rejected before HTTP; UI validation added. |
| S | Pricing displayed or marked unavailable | partial | Live catalog pricing parsed; UI renders per-million or “—”; no browser visual run. |
| T | Coexists with existing providers | verified | Installed beside ollama-cloud, reasoning-level, pi-ai, DeepSeek; row/page active. |

## Reasoning wire checks

Covered by `tests/unit/reasoning.test.mjs`, `tests/unit/protocols.test.mjs`,
`tests/unit/effort-matrix.test.mjs`, and `tests/integration/llm-contract.test.mjs`
(real `LlmRuntime`):

| Selection | Chat Completions | Responses | Anthropic Messages |
| --- | --- | --- | --- |
| Auto / omitted | no effort field | no effort field | no `output_config` |
| `none` | `reasoning_effort: "none"` where legal | `reasoning.effort: "none"` where legal | `thinking: {type: "disabled"}` |
| `minimal`/`low`/`medium`/`high` | `reasoning_effort` | `reasoning.effort` | `output_config.effort` |
| `xhigh` | distinct `xhigh` | distinct `xhigh` | distinct `xhigh` |
| `max` | distinct `max` | distinct `max` | distinct `max` |
| unsupported | rejected before HTTP | rejected before HTTP | rejected before HTTP |
| hide output | `reasoning.exclude: true` | `reasoning.exclude: true` | no documented control; warning |

## Live API calls made

The smoke used subscription-included models: `deepseek/deepseek-v4-flash-0731`
(none/low/high/max, Auto, hide, Responses, Messages, tools, native runtime),
`inclusionai/ling-3.0-flash:thinking` (minimal/medium/xhigh), and
`deepseek/deepseek-v4.1-flash-1017` (vision). The account reported USD 0/XNO 0
with an active subscription; usage `netCostUsd` stayed 0. This is not a claim
that every model or account is free.


| Call | Auth | Result |
| --- | --- | --- |
| `GET https://api.nano-gpt.com/api/v1/models?detailed=true` | none | 200; 647 chat models normalized. |
| `GET https://api.nano-gpt.com/api/models/deepseek%2Fdeepseek-v4.1-flash-1017/providers` | none | 200; 11 routes, 11 effort ladders. |
| Live smoke: connection/balance/usage/subscription | key | authenticated; subscription active, balance USD 0/XNO 0, usage netCost 0. |
| Stored key through the plugin resolver | key | `createCredentialResolver` over the real DSH credentials service returned the configured reference. |
| Live smoke: Chat efforts (none/minimal/low/medium/high/xhigh/max/Auto) | key | 8/8 streams finished with asserted wire effort fields. |
| Live smoke: Responses/Messages high | key | both streams finished; body fields asserted. |
| Live smoke: Chat hide reasoning | key | effort still sent, `reasoning.exclude` present, zero reasoning deltas, answer returned. |
| Live smoke: Chat tool call + continuation | key | tool-call finish, then final text after tool result. |
| Live smoke: vision | key | 32x32 red PNG produced “Red”; inline image data present in wire body. |
| Live smoke: native DSH runtime | key | `LlmRuntime.resolveModelInfo` → `resolveCallConfig` → `prepareCall` → streamed `high` request finished with text. |
| Live smoke: invalid key | key | `invalid-key` classification, not connected. |
| `POST /nanogpt/status` against the live web host | none | 401 unauthorized (route mounted, auth enforced). |

## Remaining release checks

1. Render the installed settings page in a real browser (light/dark, keyboard,
   every tab, error states) if browser control becomes available.
2. Restart DSH and confirm the stored credential remains usable without
   re-entry, and exercise a paid non-subscription model explicitly.
3. Re-run `npm run check` and `npm run pack:check` after the final documentation
   edits.
