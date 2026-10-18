# NanoGPT reasoning compatibility

Reference for `dsh-nanogpt`'s reasoning-effort behavior. Research date:
**2026-10-18 (UTC)**. No NanoGPT key was configured; no paid reasoning request
was made. Sources and evidence labels are the same as in
[api-compatibility.md](api-compatibility.md).

Primary documentation:

* [Extended Thinking (Reasoning)](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking)
* [Model Suffixes — Reasoning Effort Suffixes](https://docs.nano-gpt.com/api-reference/miscellaneous/model-suffixes#reasoning-effort-suffixes)
* [Change Reasoning Effort Within a Conversation](https://docs.nano-gpt.com/api-reference/miscellaneous/inline-reasoning-effort)
* [Chat Completion — Reasoning](https://docs.nano-gpt.com/api-reference/endpoint/chat-completion#reasoning-effort)
* [Responses — Reasoning Configuration](https://docs.nano-gpt.com/api-reference/endpoint/responses#reasoning-configuration)
* [Messages](https://docs.nano-gpt.com/api-reference/endpoint/messages)
* [Provider Selection — Provider row fields](https://docs.nano-gpt.com/api-reference/miscellaneous/provider-selection#provider-row-fields)
* [OpenAPI](https://docs.nano-gpt.com/api-reference/openapi.json)

Status vocabulary: **verified live** = anonymous live API observation;
**verified docs** = explicit docs/OpenAPI statement; **implemented but
unverified** = code present with no authenticated/live proof; **not supported**
= explicitly absent or refused for that surface.

## 1. Vocabulary and semantics

### The seven values

[DOCS: Extended Thinking](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking)
states: "NanoGPT accepts `none`, `minimal`, `low`, `medium`, `high`, `xhigh`,
and `max`. Not every model supports every level; some routes map an accepted
level to the nearest supported effort. `max` is a separate value from `xhigh`
where the model supports both."

The implementation uses the same escalation order
([`src/shared.ts:27-31`](../src/shared.ts#L27-L31)) and never aliases `xhigh` to
`max` or vice versa ([`src/reasoning.ts:255-292`](../src/reasoning.ts#L255-L292)).

### Auto / provider default

**Auto is not a wire value.** NanoGPT documents omission as the provider/model
default ("Available levels and defaults depend on the model"), and `none` as an
explicit request to disable reasoning *where supported*:

> "`none` requests disabled reasoning; it is not just an output-visibility
> filter. Models that require reasoning keep their existing restrictions."
> — [Extended Thinking](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking)

The implementation models this as `EffortSelection = WireEffort | 'off' |
'auto' | undefined`. `auto` and `undefined` omit the field; `off` is a legacy
DSH alias that is converted to `none` only after the same legality check
([`src/reasoning.ts:255-292`](../src/reasoning.ts#L255-L292),
[`src/protocols/common.ts:374-385`](../src/protocols/common.ts#L374-L385)).
Literal `off` and `auto` are never sent to NanoGPT.

**Do not conflate Auto with `none`.** In the current implementation:

* Auto/omitted: no effort field, no `thinking` control.
* `none`: explicit `reasoning_effort: "none"` (Chat/Responses) or
  `thinking: {type: "disabled"}` (Messages), only where the resolved policy
  permits it.

### `max` documentation inconsistency

`max` is documented in three places:

* the Extended Thinking prose (accepted values, distinct from `xhigh`);
* the model-suffix table (`:reasoning-effort/max`, inline schema);
* the OpenAPI `InlineReasoningEffort` enum used by Messages inline updates
  (`minimal`, `low`, `medium`, `high`, `xhigh`, `max`).

But the OpenAPI `ChatCompletionRequest.reasoning_effort` and
`reasoning.effort` enums list **only** `none`, `minimal`, `low`, `medium`,
`high`, `xhigh`; the Responses reasoning table likewise omits `max`. The
Responses schema describes `reasoning` as `additionalProperties: true`, so it
does not itself reject `max`.

Evidence verdict:

* **DOCS (prose, suffix table, inline schema):** `max` is a valid distinct value.
* **OPENAPI (Chat/Responses parameter enums/table):** `max` is missing.
* **LIVE:** not verifiable without a paid inference key.

The implementation sends `max` for Chat (`reasoning_effort`) and Responses
(`reasoning.effort`) when a model advertises it. This is consistent with the
prose and the live catalog but should be described as "documented in prose,
absent from the per-protocol schema enum" rather than "schema-verified".

### `minimal` and suffix shortcuts

[DOCS: Model Suffixes](https://docs.nano-gpt.com/api-reference/miscellaneous/model-suffixes#reasoning-effort-suffixes)
documents only six values for the `:reasoning-effort/<value>` shortcut:
`none`, `low`, `medium`, `high`, `xhigh`, `max`. `minimal` is explicitly body-only
("`minimal` remains available only through request-body controls on models that
support it"). The implementation never uses effort suffixes; it always uses the
body field, so it can represent `minimal` correctly
([`src/reasoning.ts:330-371`](../src/reasoning.ts#L330-L371)).

### `:thinking` variants

[DOCS: Extended Thinking](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking)
says `:thinking` is model-specific and only works when that exact ID or a
documented alias exists; `-thinking` is a legacy family-specific pattern, not
universal. The implementation does not append `:thinking` to arbitrary IDs; it
treats catalog IDs such as `z-ai/glm-5.3:thinking` as independent models
([`src/adapter.ts:253-286`](../src/adapter.ts#L253-L286)). This matches the
documented edge-case rule. Numeric Anthropic thinking-budget suffixes (for
example `...thinking:8192`) are not implemented.

## 2. Per-protocol wire mapping

### The implementation's mapping

| DSH selection | Chat Completions | OpenAI Responses | Anthropic Messages |
| --- | --- | --- | --- |
| **Auto / omitted** | no `reasoning_effort`, no `reasoning.effort`; no `reasoning.exclude` unless visibility=hide | no `reasoning` object unless visibility=hide | no `output_config`, no `thinking` field |
| **none** | `reasoning_effort: "none"` (top-level) | `reasoning: {"effort":"none"}` | `thinking: {"type":"disabled"}` (`output_config.effort:"none"` is not sent) |
| **minimal** | `reasoning_effort: "minimal"` | `reasoning.effort: "minimal"` | `output_config: {"effort":"minimal"}` |
| **low** | `reasoning_effort: "low"` | `reasoning.effort: "low"` | `output_config: {"effort":"low"}` |
| **medium** | `reasoning_effort: "medium"` | `reasoning.effort: "medium"` | `output_config: {"effort":"medium"}` |
| **high** | `reasoning_effort: "high"` | `reasoning.effort: "high"` | `output_config: {"effort":"high"}` |
| **xhigh** | `reasoning_effort: "xhigh"` | `reasoning.effort: "xhigh"` | `output_config: {"effort":"xhigh"}` |
| **max** | `reasoning_effort: "max"` | `reasoning.effort: "max"` | `output_config: {"effort":"max"}` |
| **hide output** | additionally `reasoning: {"exclude":true}` | additionally `reasoning.exclude: true` | not serialized; warning added (no documented Messages control) |

Source: [`src/reasoning.ts:330-371`](../src/reasoning.ts#L330-L371),
[`src/protocols/chat.ts:177-195`](../src/protocols/chat.ts#L177-L195),
[`src/protocols/responses.ts:206-233`](../src/protocols/responses.ts#L206-L233),
[`src/protocols/messages.ts:258-278`](../src/protocols/messages.ts#L258-L278).

### Documentation support for each cell

| Cell | Support | Notes |
| --- | --- | --- |
| Chat top-level `reasoning_effort` | **DOCS + OPENAPI** | Preferred form; OpenAPI enum omits `max`. |
| Chat nested `reasoning.effort` | **DOCS + OPENAPI** | Accepted alias; docs say top-level wins if both are present. The adapter never sends both. |
| Chat `none` | **DOCS** | Explicit disable where supported; mandatory-reasoning models reject. |
| Chat `reasoning.exclude` | **DOCS + OPENAPI** | Visibility only; does not disable compute. |
| Responses `reasoning.effort` | **DOCS** | Table lists `none`..`xhigh`, omits `max`; schema is open. |
| Responses `reasoning.exclude` | **DOCS** | Visibility only. |
| Responses `none` | **DOCS** | Explicit disable where supported. |
| Messages `output_config.effort` | **DOCS (suffix/inline)** | The Messages page documents `output_config` in the effort-suffix and inline-update context; the OpenAPI request schema includes it. `none` is not accepted inside `output_config`. |
| Messages `thinking.type: disabled` | **DOCS** | The documented `none` mapping. |
| Messages forced thinking budget | **DOCS** | `thinking: {type:"enabled", budget_tokens}` is documented; the adapter does not use it. |
| Messages hide | **NOT DOCUMENTED** | The adapter does not serialize hide on Messages and emits a warning; no suffix/body field is invented. |

### Why top-level vs nested matters

[DOCS: Extended Thinking](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking)
says both `reasoning_effort` and `reasoning.effort` are accepted, and if both are
present, top-level `reasoning_effort` is authoritative for Chat Completions.
The implementation sends only the top-level field for Chat, so precedence
conflicts cannot occur. For Responses it sends only `reasoning.effort`; for
Messages only `output_config.effort` (or `thinking` for `none`).

### `reasoning.exclude` vs `none`

This distinction is documented and implemented:

* `reasoning.exclude: true` hides returned reasoning; it does not stop reasoning
  computation.
* `reasoning_effort: "none"` requests disabled reasoning only on models that
  support it; always-thinking models reject it.

The adapter's `EffortSelection` and `ReasoningVisibility` are separate inputs,
and `wireReasoning` only sets `exclude` from visibility
([`src/reasoning.ts:330-371`](../src/reasoning.ts#L330-L371)). Selecting `hide`
does not change the effort.

## 3. Availability states

### How the adapter resolves a ladder

`resolveReasoning` ([`src/reasoning.ts:143-237`](../src/reasoning.ts#L143-L237))
has this order:

1. explicit pinned-provider route `features.reasoningEfforts`;
2. explicit user/deployment override;
3. the catalog `reasoning_efforts` ladder;
4. the three hardcoded documented policies;
5. `capabilities.reasoning` with no ladder → unknown;
6. non-reasoning (`reasoning:false`) → no policy.

The order differs from the "route → API → documentation → override" prose in
[AGENTS.md](../AGENTS.md) and [architecture.md](architecture.md#L123-L125):
the implementation puts an explicit override ahead of the API ladder. ADR-004
acknowledges this as a deliberate deviation; the architecture doc still states
the other order.

### State matrix

| Catalog state | DSH result intended | Actual DSH-visible result |
| --- | --- | --- |
| `capabilities.reasoning:false` and no ladder | no reasoning menu; omission | No `reasoning` metadata. **Correct.** |
| `capabilities.reasoning:true` + non-empty `reasoning_efforts` | menu contains exactly those values | Menu from API ladder. **Correct** for the wire values. |
| `capabilities.reasoning:true` + no `reasoning_efforts` | "unknown/provider default only"; user can still use the model | **Correct after the current-source fix:** the policy is `unknown`, and the adapter advertises a single adapter-owned `auto` effort. DSH accepts the non-empty list; selecting `auto` omits the wire effort. 155 live chat models are in this state. |
| non-empty ladder without `none` | infer always-thinking; remove disable | `alwaysThinking:true`, `supportsDisable:false`; `none` rejected before HTTP. **Implemented inference**, not per-model documentation. |
| ladder with `none` | optional reasoning; disable legal | `supportsDisable:true`. |
| ladder including `minimal` | menu includes minimal | Body field only; correct (no suffix). |
| ladder including both `xhigh` and `max` | both distinct | Both mapped independently; no clamping. |
| `:thinking` catalog ID | treat as distinct model | Distinct ID; not appended. |
| route-specific ladder differs from model ladder | pinned route narrows/widens | `route.efforts` wins when `routing.mode:"provider"`. **Correct**, but only for pinned routes. |
| unknown but `experimental:true` | all seven offered, labelled inference | All seven offered, `source:"inferred"`, `unverifiedLevels` all seven. |

### Unknown-ladder handling (fixed in the current source)

The public schema says the field is omitted for fixed-reasoning, toggle-only,
or undocumented models, so absence is not evidence that a model cannot reason.

Live 2026-10-18: **155 of 647 chat models** have
`capabilities.reasoning: true` but no `reasoning_efforts` key (examples:
`qwen/qwen3.8-27b-cybersecurity`, `moondream/moondream3-preview`,
`nvidia/nemotron-3.5-content-safety`).

During this research the path was:

1. [`src/reasoning.ts`](../src/reasoning.ts#L177-L199) sets `efforts=[]`,
   `unknown=true`, and returns the policy;
2. the adapter mapped it to `{ efforts: [] }`;
3. DSH's `resolveModelInfoFor` throws
   `adapter returned invalid reasoning metadata ...` when
   `reasoning.efforts.length === 0`
   (`node_modules/@deepseek-ai/dsh-llm/lib/index.js:2133-2134`).

The current working tree corrects this in
[`src/adapter.ts:160-193`](../src/adapter.ts#L160-L193): when the policy has no
efforts, it advertises one adapter-owned `auto` effort with the description
that only the provider default is known. DSH accepts a one-entry list, and the
adapter maps `auto`/omitted to "omit the effort field"
([`src/reasoning.ts:255-292`](../src/reasoning.ts#L255-L292)). The
`unknown`/`experimental` facts remain in the settings model view.

**Remaining requirement:** add a regression test that resolves every live
catalog model through the real DSH runtime validator, not only through
`resolveReasoning`. The existing unit test
(`tests/unit/effort-matrix.test.mjs:179-189`) asserts `policy.efforts === []`
and would not catch a regression in the adapter's DSH metadata conversion.

### Auto availability

`reasoningInfo` advertises `auto` in two cases
([`src/adapter.ts:160-193`](../src/adapter.ts#L160-L193)):

* the policy has no efforts (unknown ladder) → Auto-only;
* the policy has a concrete `defaultEffort` → Auto is prepended to the ladder.

For models with a known ladder but **no** configured/documented default (for
example `openai/gpt-5.4`, `anthropic/claude-fable-5.1`,
`openai/gpt-6-astra`), the selector does not list Auto. Omission still works if
the caller omits the field, but the user cannot explicitly select "provider
default" in the native selector. This contradicts [ADR-005](decisions.md#L76-L88)
and the AGENTS requirement that Auto be supported distinctly. It is not a wire
bug; it is a selector/UX gap. Advertising `auto` for every reasoning policy
would fix it without changing the wire behavior.

### Model-specific restrictions that are documented

Only the following are citable; do not generalize them.

#### Claude Opus 5.5 (`anthropic/claude-opus-5.5`)

[DOCS: Extended Thinking — Claude Opus 5.5](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking#claude-opus-55):

* adaptive thinking by default; no explicit enable flag or `:thinking` needed;
* native values `low`, `medium`, `high`, `xhigh`, `max`;
* default `high` when no effort/budget is supplied;
* `reasoning_effort:"none"` or `thinking.enabled:false` returns
  `reasoning_required`;
* forced tool choice (`"required"` or a named tool) is unsupported with adaptive
  thinking; use `auto`/`none`;
* hide returned reasoning with `reasoning.exclude:true` instead of disabling.

Live catalog matches the five-value ladder. The adapter rejects `none` because
the ladder lacks it and treats the model as always-thinking. It never sends
`tool_choice` (DSH exposes no such control), so the forced-tool restriction is
not triggerable by this plugin.

#### Claude Fable 5.1 (`anthropic/claude-fable-5.1`)

[DOCS: Inline Reasoning Effort — Supported combinations](https://docs.nano-gpt.com/api-reference/miscellaneous/inline-reasoning-effort#supported-combinations):

* inline efforts `low`, `medium`, `high`, `xhigh`, `max`;
* `minimal` maps to `low`;
* `none` is rejected;
* forced tool choice may be rejected; use automatic tool choice.

Live catalog ladder is `low`..`max` (no `none`/`minimal`), so the adapter's
normal menu matches the documented native ladder. The documented
`minimal`→`low` alias is implemented in the current source
([`src/reasoning.ts:255-257`](../src/reasoning.ts#L255-L257),
[`src/reasoning.ts:264-292`](../src/reasoning.ts#L264-L292)): if an override or
experimental policy exposes `minimal`, `normalizeEffortSelection` maps it to
`low` before the legality check. It is not reachable on the live Fable ladder
because the catalog does not advertise `minimal`; that is a catalog fact, not a
missing mapping.

#### GPT-6 Astra (`openai/gpt-6-astra`)

[DOCS: Inline Reasoning Effort — Supported combinations](https://docs.nano-gpt.com/api-reference/miscellaneous/inline-reasoning-effort#supported-combinations)
lists inline efforts `low`, `medium`, `high`, `xhigh`. This is an **inline-update
restriction**, not a statement that the model-wide ladder lacks `max`. The live
catalog on 2026-10-18 advertises `low`..`max` for Astra. The hardcoded fallback
policy in [`src/reasoning.ts:50-53`](../src/reasoning.ts#L50-L53) records only
the inline range, so if the catalog ever omits the ladder, the plugin would
under-advertise `max`. The API catalog always wins today, so the fallback is
dormant, but its "documented model policy" label is misleading.

#### General mandatory-reasoning rule

[DOCS: Extended Thinking](https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking):
"Always-thinking models keep their reasoning requirements; Claude Opus 5.5
rejects attempts to disable thinking." The adapter implements this for any
ladder without `none` by setting `alwaysThinking:true` and rejecting `none`
before HTTP. That is an **inference for models whose docs were not read
individually**, not a per-model verified fact.

### Route-specific ladders

[DOCS: Provider Selection — Provider row fields](https://docs.nano-gpt.com/api-reference/miscellaneous/provider-selection#provider-row-fields)
documents `features.reasoningEfforts` (accepted `reasoning_effort` levels) and
`features.reasoningAlwaysOn`. Live example (2026-10-18):

* `deepseek/deepseek-v4.1-flash-1017` model-wide ladder:
  `none`, `low`, `high`, `max`;
* its 11 provider rows all expose `features.reasoningEfforts`; the first
  (`deepinfra`) exposes `none`, `low`, `high` (no `max`).

The adapter uses route facts only when `routing.mode === "provider"` and the
exact provider row is found
([`src/adapter.ts:333-378`](../src/adapter.ts#L333-L378)). If routing is
automatic/speed/etc., it uses the model-wide ladder; a dynamically chosen route
may narrow it. The UI/notes should say "pinned route" for route-specific data,
not claim route-specific verification on Auto.

## 4. Live catalog evidence

Counts from `GET /api/v1/models?detailed=true` on **2026-10-18** (663 records,
647 chat models):

| Fact | Count |
| --- | ---: |
| Chat models with `reasoning_efforts` | 243 |
| Chat models with `capabilities.reasoning:true` and **no** ladder | 155 |
| Chat models with `reasoning_efforts` but `reasoning:false` | 0 |
| Models advertising `none` | 117 |
| Models advertising `minimal` | 31 |
| Models advertising `low` | 170 |
| Models advertising `medium` | 137 |
| Models advertising `high` | 240 |
| Models advertising `xhigh` | 77 |
| Models advertising `max` | 96 |
| Models advertising all seven | 2 |

`reasoning_efforts` is documented in the public
[nano-gpt.com/openapi.json](https://nano-gpt.com/openapi.json) `Model` schema
("Exact accepted reasoning effort values when the model exposes a configurable
effort scale. Omitted for fixed-reasoning, toggle-only, or undocumented
models."), with the all-seven enum. It is **omitted from the docs bundle**
(`llms-full.txt` has zero occurrences), which is why it can look live-only. The
documented per-route equivalent is `features.reasoningEfforts` on the
provider-discovery endpoint.

### Concrete examples

All ladders below are **LIVE** from the 2026-10-18 catalog. "Always-on" is
documented only where noted; otherwise it is inferred from a ladder that lacks
`none`.

| Model ID | `reasoning_efforts` | `capabilities.reasoning` | Always-on |
| --- | --- | --- | --- |
| `anthropic/claude-opus-5.5` | `low, medium, high, xhigh, max` | true | **DOCS:** yes; adaptive, `none` rejected, default high |
| `anthropic/claude-fable-5.1` | `low, medium, high, xhigh, max` | true | **DOCS (inline):** `none` rejected; ladder inference: yes |
| `openai/gpt-6-astra` | `low, medium, high, xhigh, max` | true | inferred (no `none`); inline combo range is lower |
| `openai/gpt-5.6-sol` | `none, low, medium, high, xhigh, max` | true | no (has `none`) |
| `openai/gpt-5.1-codex-max` | `none, minimal, low, medium, high, xhigh` | true | no (has `none`); no `max` |
| `openai/gpt-5-pro` | `high` | true | inferred yes |
| `openai/gpt-5` | `minimal, low, medium, high` | true | inferred yes |
| `meta/muse-wonder` | `minimal, low, medium, high, xhigh, max` | true | inferred yes |
| `meta/muse-spark-1.3` | `minimal, low, medium, high, xhigh` | true | inferred yes |
| `z-ai/glm-5.2` | `none, high, max` | true | no (has `none`) |
| `z-ai/glm-5.2:thinking` | `high, max` | true | inferred yes; distinct `:thinking` model |
| `xiaomi/mimo-v2.6-flash-uncensored:thinking` | `max` | true | inferred yes; only `max` |
| `prism-ml/ternary-bonsai-2-27b` | `medium, xhigh` | true | inferred yes; unusual subset |
| `google/diffusiongemma` | `none, xhigh` | true | no (has `none`); unusual subset |
| `abliteration-ai/abliterated-model` | all seven | true | no (has `none`) |
| `qwen/qwen3.8-max-0902` | `none, low, medium, high, max` | true | no (has `none`) |
| `deepseek/deepseek-v4-flash-latest` | `none, low, high, max` | true | no (has `none`) |
| `fireworks/ember-1` | `none, low, high, max` | true | no (has `none`) |
| `moonshotai/kimi-k2.6` | — | false | non-reasoning |
| `qwen/qwen3.8-27b-cybersecurity` | — | true | **unknown ladder**; current source advertises Auto-only (previously triggered the empty-efforts DSH rejection) |

These examples demonstrate why seven fixed levels cannot be assumed: live
ladders include `high` only, `max` only, `none`+`xhigh`, `medium`+`xhigh`, and
every subset between. The adapter represents the advertised subset; it does not
invent missing values.

### Ladder distribution

| Ladder shape | Models |
| --- | ---: |
| no ladder | 420 of 663 total (includes non-chat); 155 chat with `reasoning:true` |
| `none, high` | 56 |
| `low, medium, high, xhigh, max` | 34 |
| `low, medium, high` | 30 |
| `low, high, max` | 19 |
| `none, low, high, max` | 14 |
| `minimal, low, medium, high` | 14 |
| `none, low, medium, high` | 12 |
| `none, low, medium, high, xhigh, max` | 11 |
| `minimal, low, medium, high, xhigh` | 10 |
| `low, medium, high, xhigh` | 7 |
| `none, low, medium, high, xhigh` | 5 |
| `none, high, max` | 5 |
| other observed shapes | remainder |

## 5. Suffix interactions

### Effort suffixes

[DOCS](https://docs.nano-gpt.com/api-reference/miscellaneous/model-suffixes#reasoning-effort-suffixes)
documents `:reasoning-effort/<none|low|medium|high|xhigh|max>` on Chat,
Responses, and Messages:

* Chat: default top-level `reasoning_effort`;
* Responses: default `reasoning.effort`;
* Messages: default `output_config.effort`; `none` supplies
  `thinking:{type:"disabled"}`;
* body generation settings take precedence over the suffix;
* one suffix only; rightmost recognized if repeated;
* unknown values remain in the model id and are not silently replaced;
* `minimal` is body-only;
* support remains model/provider-specific; the suffix does not add capability.

The adapter does not append effort suffixes; it always uses the body field.
This is the documented primary form and avoids the `minimal` gap. It also means
the plugin has no conflict between a suffix and a body effort.

### Thinking and visibility suffixes

* `:thinking` is model identity; the adapter preserves catalog IDs that contain
  it and does not append it.
* `:reasoning-exclude` is equivalent to `reasoning: {exclude:true}` and is
  documented for Chat Completions and Text Completions. The adapter uses the
  body field for Chat/Responses; on Messages it omits hide and warns because no
  Messages control is documented.
* Effort suffixes can compose with `:thinking`, `:online`, and memory according
  to the docs. The adapter's own suffix composition (web search + Messages
  routing) is additive; it does not emit an effort suffix.
* Do not combine routing preference suffixes with `X-Provider`, body
  `provider`, or provider model suffixes. Chat uses body routing
  (`provider`/top-level `caching`); Responses and Messages append documented
  suffixes and use `X-Provider` only in provider mode. The earlier Responses
  body-routing defect is fixed in the current source.

### Route/provider interaction

A pinned provider can narrow the effort ladder (live DeepSeek example above).
The adapter uses route facts only in `routing.mode:"provider"`. For automatic
routing, the model-wide ladder is advertised even though the selected route may
narrow it; this is an honest limitation only if the UI labels it as model-wide
rather than route-verified.

## 6. Inline reasoning-effort updates

### What NanoGPT documents

[DOCS: Change Reasoning Effort Within a Conversation](https://docs.nano-gpt.com/api-reference/miscellaneous/inline-reasoning-effort)
documents ordered effort updates for exactly two models on compatible endpoints:

* **GPT-6 Astra** (`openai/gpt-6-astra`): `low`, `medium`, `high`, `xhigh`.
* **Claude Fable 5.1** (`anthropic/claude-fable-5.1`): `low`, `medium`, `high`,
  `xhigh`, `max`; `minimal` maps to `low`; `none` rejected.

Supported combinations from the docs:

| Model | Chat Completions | Responses | Anthropic Messages | Inline efforts |
| --- | --- | --- | --- | --- |
| GPT-6 Astra (`openai/gpt-6-astra`) | `configuration_update` on an empty `system`/`developer` message | `configuration_update` input item (native Responses transport) | empty `system`-role message with `output_config` | `low`, `medium`, `high`, `xhigh` |
| Claude Fable 5.1 (`anthropic/claude-fable-5.1`) | same | same (native Responses transport) | same | `low`, `medium`, `high`, `xhigh`, `max`; `minimal` maps to `low`; `none` rejected |

Rules from the docs:

* Keep the request-level effort (the baseline) constant.
* Insert an update immediately before the user turn that needs a different
  effort, or append it after the final user turn to control that request's
  answer.
* The new effort persists until replaced.
* Replay updates in their original position; do not replace or move them.
* Update forms:
  * Chat Completions: `system` or `developer` message with empty content and
    `configuration_update: {reasoning:{effort:...}}`;
  * Responses: `{type:"configuration_update", reasoning:{effort:...}}` input
    item;
  * Messages: `system`-role update with empty content and
    `output_config:{effort:...}`.
* Trailing updates are accepted on all three APIs.
* The initial implementation rejects non-empty updates, adjacent updates, pro
  mode, unsupported models/efforts, automatic truncation,
  context-management/compaction controls, multi-agent controls, Advisor,
  memory/history-limit controls, background requests, explicit BYOK,
  hosted/non-function tools, and Batch lines.
* `reasoning.exclude:true` with inline updates is rejected on Responses.
* Chat/Messages response-local visibility handling is preserved.
* Streaming, non-streaming, function tools, complete tool histories, and
  post-tool continuations are supported when the history representation is
  preserved.
* Model-specific tool restrictions still apply (Fable may reject forced tool
  choice).

### Does DSH preserve what is needed?

Partially, and not in the current adapter:

* `GenerateOptions.messages` is the complete ordered history the provider sees
  ([DSH `GenerateOptions`](../node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts)).
  The loop also supplies `toolHistory` and complete tool/reasoning blocks.
* Each assistant message carries an adapter-private `ReplayEnvelope`
  ([`src/replay.ts`](../src/replay.ts)); DSH hands it back only to the adapter
  that produced it. This is enough to attach per-turn adapter state.
* DSH has **no first-class `configuration_update` message/block type** and no
  per-turn effort history. `GenerateOptions.reasoningEffort` is one current
  value.
* The current `NanoReplay` stores protocol/model/ids/block metadata/output
  items, but **not the effort used for that turn**
  ([`src/replay.ts:27-47`](../src/replay.ts#L27-L47)). It therefore cannot
  reconstruct effort changes at the exact positions later.
* DSH removes developer messages before the adapter unless a route declares
  `toolUpdate` support (`withoutDeveloperMessages` in the installed
  `dsh-llm` runtime). A wire-only synthesized system/developer update could
  still be emitted, but it would not be a durable DSH event.

A faithful implementation would require, at minimum:

1. storing the effort used on every assistant message in the adapter's replay
   envelope;
2. choosing a stable baseline and reconstructing ordered updates at the
   original positions;
3. preserving tool/reasoning output items and signatures across those
   positions;
4. restricting the path to Astra/Fable and the exact compatible endpoints, and
   rejecting the documented unsupported combinations (adjacent/non-empty
   updates, Responses `exclude`, compaction, etc.);
5. handling histories with missing/unknown replay metadata conservatively
   (fall back to standard per-request effort rather than guessing).

**Current status: not implemented.** The adapter always sends one request-level
effort and never injects `configuration_update`. This is a documented
limitation, not a silent behavior. [ADR-013](decisions.md#L168-L180) records the
decision, but its claim that DSH lacks "the complete ordered conversation
representation" is too strong for the reasons above: DSH does preserve ordered
messages and per-message replay state; what it lacks is a first-class update
representation and the adapter currently lacks per-turn effort storage.
The accurate limitation is: **the feature would require new adapter-private
state and careful synthesis; it is not present today.**

## 7. Discrepancies and required changes

| # | Severity | Finding | Evidence | Required action |
| --- | --- | --- | --- | --- |
| R1 | Resolved in current tree | Unknown reasoning ladder previously produced empty `efforts` and DSH rejected it. Current source advertises Auto-only instead. 155 live chat models were affected. | [`src/adapter.ts:160-193`](../src/adapter.ts#L160-L193), [`src/reasoning.ts:177-199`](../src/reasoning.ts#L177-L199), DSH `dsh-llm/lib/index.js:2133-2134` | **Still required:** add a runtime-contract test that resolves every live catalog model through DSH, not only through the policy resolver. |
| R2 | High | Auto is advertised for unknown ladders and when a concrete default exists, but not for a known ladder with no configured/documented default. | [`src/adapter.ts:160-193`](../src/adapter.ts#L160-L193), ADR-005 | Advertise `auto` for every reasoning-capable policy; it already maps to omission. |
| R3 | High | `max` is sent on Chat/Responses though their request-parameter enums/table omit it. The model schema and model suffix/inline schemas do list `max`. | [`src/reasoning.ts:330-348`](../src/reasoning.ts#L330-L348), Chat/Responses OpenAPI, [Model.reasoning_efforts](https://nano-gpt.com/openapi.json) | Keep prose/live behavior but label it "documented in model/suffix/inline contracts, absent from Chat/Responses request enums"; verify with a budgeted key before claiming protocol-level proof. |
| R4 | Medium | Hardcoded Astra fallback uses inline limits (`low`..`xhigh`) as a model ladder; live catalog has `low`..`max`. | [`src/reasoning.ts:50-53`](../src/reasoning.ts#L50-L53) | Label it inline-only or extend to `max`; API wins today, so this is a dormant under-advertisement. |
| R5 | Resolved in current tree | Fable `minimal`→`low` is now normalized before validation; the live ladder still does not advertise `minimal`, so the mapping is only reachable through an override/experimental policy. | [`src/reasoning.ts:255-257,264-292`](../src/reasoning.ts#L255-L292), inline docs | Add a test that an override exposing `minimal` serializes `low` for this exact model. |
| R6 | Medium | Always-on is inferred from "no `none` in ladder" for models without individual docs. | [`src/reasoning.ts:203-207`](../src/reasoning.ts#L203-L207) | Keep the inference but label it "inferred from catalog"; do not present it as documented per-model behavior. |
| R7 | Medium | Messages `output_config.effort: "minimal"` is sent for models whose ladder includes minimal; the Messages docs only explicitly discuss Fable's minimal→low mapping. | [`src/protocols/messages.ts:258-278`](../src/protocols/messages.ts#L258-L278) | Treat as unverified for non-Fable models; verify per model or map minimal→low where documented. |
| R8 | Low | Messages hide has no documented transport control; the adapter correctly omits it and warns, but the UI should explain that hiding is unavailable on Messages. | [`src/reasoning.ts:360-371`](../src/reasoning.ts#L360-L371), [`src/protocols/messages.ts:212-213`](../src/protocols/messages.ts#L212-L213) | Surface the warning in the settings page; do not present the hide toggle as effective on Messages. |
| R9 | Low | Route-specific ladders are used only for pinned providers; Auto may advertise a ladder the selected route lacks. | [`src/adapter.ts:333-378`](../src/adapter.ts#L333-L378) | Label model-wide vs pinned-route capability in the UI. |
| R10 | Low | Reasoning diagnostics/tests never verify the live provider accepts the selected value. | `tests/unit/*`; no paid key | Do not claim live reasoning verification; use the language "wire-contract tested". |

## 8. Verification status

* **LIVE:** the catalog ladders, counts, and provider route ladders in this
  document were observed from the anonymous endpoints on 2026-10-18.
* **DOCS:** the vocabulary, omission/`none` semantics, protocol field placement,
  `max` prose, suffix rules, inline-update rules, and model-specific
  restrictions are quoted from the linked pages.
* **CODE:** the adapter's resolver and wire mappings were read and, for policy
  behavior, exercised directly through `lib/reasoning.js`.
* **NOT VERIFIED:** any real Chat/Responses/Messages reasoning request,
  streaming reasoning output, tool-call continuation, or provider acceptance of
  `max`/`minimal` through each protocol. No key was available; no paid request
  was made.
