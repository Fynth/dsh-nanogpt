# NanoGPT API compatibility

Evidence-based reference for the NanoGPT surface used by `dsh-nanogpt`.
Research date: **2026-10-18 (UTC)**. No NanoGPT API key was configured during
this work; no paid inference, balance, usage, or subscription read was
performed. This document therefore separates facts observed from the public API
and documentation from facts that only the implementation assumes.

## Evidence labels

| Label | Meaning |
| --- | --- |
| **LIVE** | Observed with an unauthenticated `curl` request against the public endpoint on 2026-10-18; exact status/body shape recorded below. |
| **DOCS** | Explicitly stated on `docs.nano-gpt.com` (page linked). |
| **OPENAPI** | Stated by the published OpenAPI document at `https://docs.nano-gpt.com/api-reference/openapi.json`. |
| **CODE** | Implemented in this repository; file and line cited. |
| **INFERRED** | A reasonable derivation that the sources do not state explicitly. Never treated as verified. |
| **NOT VERIFIED** | Implemented or claimed, but no live authenticated call or authoritative source proves it. |

Status vocabulary used in this document maps to the requested labels:

* **verified live** — LIVE (anonymous public endpoint observation).
* **verified docs** — DOCS or OPENAPI.
* **implemented but unverified** — CODE present, no live authenticated proof.
* **not supported** — explicitly absent, refused, or not documented for that
  surface (never silently assumed).

Two important limits apply throughout:

1. Public model and provider-discovery endpoints are anonymous. A successful
   catalog request is **not** proof of a valid key (NanoGPT documents that
   invalid/missing keys still return models:
   [models authentication](https://docs.nano-gpt.com/api-reference/endpoint/models#authentication)).
2. The catalog is a moving snapshot. Counts and examples below are the
   **2026-10-18** snapshot, not a permanent contract.

## 1. Hosts, base paths, and authentication

### Documented hosts

[DOCS: API Hosts](https://docs.nano-gpt.com/api-reference/miscellaneous/api-hosts)
recommends the direct API host:

| Purpose | Base URL / endpoint |
| --- | --- |
| OpenAI-compatible SDKs | `https://api.nano-gpt.com/api/v1` |
| Anthropic SDK | `https://api.nano-gpt.com/api` (the SDK appends `/v1/messages`) |
| Raw Chat Completions | `https://api.nano-gpt.com/api/v1/chat/completions` |
| Raw Responses | `https://api.nano-gpt.com/api/v1/responses` |
| Raw Messages | `https://api.nano-gpt.com/api/v1/messages` |
| Website host | `https://nano-gpt.com` (dashboard, keys, browser flows) |

Additional sources consulted on 2026-10-18: [nano-gpt.com/api](https://nano-gpt.com/api)
(a marketing/quickstart page that advertises 1,212 text/image/video/audio
models and shows the website base URL `https://nano-gpt.com/api/v1`) and
[nano-gpt.com/agents](https://nano-gpt.com/agents) (the agent harness/MCP pack;
no additional reasoning contract). Neither overrides the API Hosts page's
recommendation of the direct host for API-key inference.

The docs warn that the website host and direct host **can have different model
catalogs during rollouts**. The docs-bundle OpenAPI servers are
`https://api.nano-gpt.com/api` and `https://nano-gpt.com/api`
([OPENAPI](https://docs.nano-gpt.com/api-reference/openapi.json)).

A separate public schema at **[https://nano-gpt.com/openapi.json](https://nano-gpt.com/openapi.json)**
(fetched 2026-10-18, `200`, 301,324 bytes, `application/vnd.oai.openapi+json`)
is more complete for model fields. It is the source for the `context_length`
and `reasoning_efforts` corrections in this document. Its `Model` schema also
includes `aliases`, `canonical_id`, `supported_service_tiers`, and
`supported_parameters`; it allows additional properties, which is why live
`capabilities`, `subscription`, `providers`, and `open_weights` are not listed
there but still appear.

The implementation default is `https://api.nano-gpt.com/api/v1`
([`src/shared.ts:22`](../src/shared.ts#L22)); it derives non-`/v1` endpoints
from the URL origin ([`src/config.ts:455-498`](../src/config.ts#L455-L498)).
`/api` is normalized to `/api/v1`, so the Anthropic-SDK base spelling of
`https://api.nano-gpt.com/api` produces `/api/v1/messages` in this client.

### Authentication headers

[DOCS: Authentication](https://docs.nano-gpt.com/authentication) documents:

* `Authorization: Bearer <API_KEY>` — recommended for inference.
* `X-API-Key: <API_KEY>` — accepted alternative.
* New keys look like `sk-nano-<uuid>`; legacy plain-UUID keys are accepted.

The implementation sends `Authorization: Bearer ...` for inference/catalog
requests ([`src/http.ts:139-145`](../src/http.ts#L139-L145)) and sends **both**
Bearer and `x-api-key` on authenticated account reads through `accountHeaders`
([`src/http.ts:154-159`](../src/http.ts#L154-L159)). The `check-balance` OpenAPI
security scheme is named `x-api-key`, but a live probe with an invalid Bearer
token was parsed as a key attempt (`401 malformed_api_key`), not as a
missing-authorization request, so both headers are accepted there. Inference
requests remain Bearer-only, which is the docs' recommended form; a deployment
that can only use `X-API-Key` for inference is not covered.

### Endpoint probe log

All requests below were made without a real credential. `POST` requests had no
inference payload and could not spend money.

| Method and path | Live result | Interpretation |
| --- | --- | --- |
| `GET https://api.nano-gpt.com/api/v1/models?detailed=true` | `200`, `application/json`, 783,766 bytes, 663 records | Detailed catalog available; 647 pass the code's chat filter. |
| `GET https://api.nano-gpt.com/api/v1/models` | `200`, 61,809 bytes, 663 records, only `id/object/created/owned_by` | Basic mode intentionally minimal. |
| `GET https://api.nano-gpt.com/api/v1/models?detailed=true` with an invalid Bearer placeholder | `200`, same detailed list | Invalid keys still get the public list; consistent with docs. |
| `GET https://api.nano-gpt.com/api/models/openai%2Fgpt-5.4/providers` | `200`, `supportsProviderSelection:false`, `providerDetails:[]` | Documented provider-discovery path works; model does not support selection. |
| `GET https://api.nano-gpt.com/api/models/moonshotai%2Fkimi-k2.6/providers` | `200`, `supportsProviderSelection:true`, 33 provider rows | Public provider IDs/prices are returned. |
| `GET https://api.nano-gpt.com/api/models/deepseek%2Fdeepseek-v4.1-flash-1017/providers` | `200`, 11 rows, all with `features.reasoningEfforts` | Route-specific ladders exist. |
| `GET https://api.nano-gpt.com/api/check-balance` (no auth) | `405` | Route exists but requires POST. |
| `POST https://api.nano-gpt.com/api/check-balance` with invalid Bearer | `401` `malformed_api_key` | Bearer is parsed; shape of a successful response remains unverified. |
| `GET https://api.nano-gpt.com/api/v1/usage` (no auth) | `401` `missing_api_key` | Route exists and is authenticated. |
| `GET https://api.nano-gpt.com/api/subscription/v1/usage` (no auth) | `401` `missing_api_key` | Route exists and is authenticated. |
| `POST https://api.nano-gpt.com/api/v1/chat/completions` (no auth) | `401` `missing_api_key` | Route exists. |
| `POST https://api.nano-gpt.com/api/v1legacy/chat/completions` (no auth) | `401` `missing_api_key` | Documented legacy path exists on the server; not implemented by this plugin. |
| `POST https://api.nano-gpt.com/api/v1thinking/chat/completions` (no auth) | `401` `missing_api_key` | Documented merged-thinking path exists; not implemented by this plugin. |
| `POST https://api.nano-gpt.com/api/v1/responses` (no auth, `{}`) | `400` `missing_required_parameter` / `model` | Route exists; validation precedes auth. |
| `POST https://api.nano-gpt.com/api/v1/messages` (no auth, `{}`) | `400` `Missing or invalid model` | Route exists; validation precedes auth. |
| `GET https://nano-gpt.com/api/v1/models?detailed=true` | `200`, same 783,766-byte catalog at this moment | Website host reachable; docs still warn catalogs can differ. |

### Endpoint builders in the implementation

| Builder | Result | Evidence |
| --- | --- | --- |
| [`modelsEndpoint`](../src/config.ts#L814-L816) | `<base>/models?detailed=true` | Matches [DOCS: Models](https://docs.nano-gpt.com/api-reference/endpoint/models). |
| [`protocolEndpoint`](../src/config.ts#L802-L811) | `<base>/chat/completions`, `<base>/responses`, `<base>/messages` | Matches raw paths in API Hosts docs. No legacy/thinking variant. |
| [`providersEndpoint`](../src/config.ts#L832-L837) | `<origin>/api/models/<encodeURIComponent(id)>/providers` | Matches [DOCS: Provider Selection](https://docs.nano-gpt.com/api-reference/miscellaneous/provider-selection#discover-providers-and-pricing), including `%2F` encoding. |
| [`balanceEndpoint`](../src/config.ts#L840-L842) | `<origin>/api/check-balance` | Matches `POST /check-balance` in OpenAPI. |
| [`usageEndpoint`](../src/config.ts#L845-L847) | `<base>/usage` | Matches `/v1/usage` in [DOCS: Usage](https://docs.nano-gpt.com/api-reference/endpoint/usage). |
| [`subscriptionUsageEndpoint`](../src/config.ts#L850-L852) | `<origin>/api/subscription/v1/usage` | Matches [DOCS: Subscription Usage](https://docs.nano-gpt.com/api-reference/endpoint/subscription-usage). The documented `/api/v1/subscription/usage` alias is not used, which is acceptable. |

No endpoint path in `src/` was found to be invented. The missing endpoints are
the documented Chat Completions variants noted below.

Error classification: [`src/errors.ts:126-173`](../src/errors.ts#L126-L173)
maps 401/403 to `AUTH`, 402 to `QUOTA`, 429 to `RATE_LIMIT`, 5xx to `SERVER`,
and 400/404/409/413/422 to `INVALID_REQUEST`, which matches
[DOCS: Error Handling](https://docs.nano-gpt.com/api-reference/miscellaneous/error-handling)'s
categories. The one inconsistency is that the generic JSON helper used by
catalog/usage maps 402 to `INVALID_REQUEST` instead of `QUOTA`
([`src/http.ts:118-124`](../src/http.ts#L118-L124)); see §7.

## 2. Detailed model catalog

### What the endpoint actually returns

`GET /api/v1/models?detailed=true` returned a top-level
`{"object":"list","data":[...]}` with **663** records on 2026-10-18. The
implementation's chat filter (`output_modalities` must include `text`, and
`category: "Decisions"` is excluded unless text output is present,
[`src/catalog.ts:229-234`](../src/catalog.ts#L229-L234)) keeps **647** records,
matching the previously recorded 647-chat-model count.

Field presence in the 663 records:

| Field | Records | Documented by NanoGPT? | Code mapping | Verdict |
| --- | ---: | --- | --- | --- |
| `id` | 663 | **DOCS** basic field | `CatalogModel.id` ([`src/catalog.ts:181-199`](../src/catalog.ts#L181-L199)) | Correct. |
| `object` | 663 | **DOCS** basic field | Ignored | Fine; no DSH use. |
| `created` | 663 | **DOCS** basic field | Ignored | Not mapped; DSH has no creation-time field. |
| `owned_by` | 663 | **DOCS** basic field | `CatalogModel.provider` ([`src/catalog.ts:202`](../src/catalog.ts#L202)) | Correct semantic provider/family token. |
| `name` | 663 | **DOCS** detailed field | `CatalogModel.name` ([`src/catalog.ts:197`](../src/catalog.ts#L197)) | Correct. |
| `description` | 663 | **DOCS** detailed field | Sanitized to `description` ([`src/catalog.ts:201`](../src/catalog.ts#L201)) | Correct; sanitizer bounds it to 4,000 chars. |
| `context_length` | 663 (number or `null`) | **OPENAPI** `Model.context_length`: "Total context window shared by input and generated output. Null when unavailable." (The older models-page table says "maximum input tokens"; that wording is stale/contradictory.) | `CatalogModel.contextWindow` ([`src/catalog.ts:203`](../src/catalog.ts#L203)) | **Correct one-to-one mapping.** DSH defines `contextWindow` as the maximum combined request and response context ([DSH type comment](../node_modules/@deepseek-ai/dsh-llm/lib/types/types.d.ts)), which is exactly what the schema says. Do **not** add `max_output_tokens` or use an input-only interpretation. Cite [nano-gpt.com/openapi.json](https://nano-gpt.com/openapi.json) `components.schemas.Model.properties.context_length`. |
| `max_output_tokens` | 663 (number or `null`) | **DOCS** detailed field | `CatalogModel.maxOutputTokens` ([`src/catalog.ts:204-206`](../src/catalog.ts#L204-L206)) | Correct; `null` becomes absent. |
| `architecture.modality` | 663 | Not in field table; implied by examples | Ignored; modalities read separately | Fine; redundant. |
| `architecture.input_modalities` | 663 | **DOCS** video-discovery note | Text/image projected to `inputModalities`; `video_input`/`audio_input` kept as booleans ([`src/catalog.ts:186-193`](../src/catalog.ts#L186-L193)) | Conservative and correct for DSH, whose modality vocabulary is text/image only. |
| `architecture.output_modalities` | 663 | Not in field table; **DOCS** Decisions note | Used only for chat filtering, not exposed in `CatalogModel` ([`src/catalog.ts:240`](../src/catalog.ts#L240)) | Correct for the chat provider. |
| `capabilities.vision` | 663 | **DOCS** | Contributes to image modality and `vision` ([`src/catalog.ts:188-193`](../src/catalog.ts#L188-L193)) | Correct, though a `vision:true` + no-image-modality contradiction trusts vision. |
| `capabilities.video_input` | 663 | **DOCS** | `videoInput` ([`src/catalog.ts:209`](../src/catalog.ts#L209)) | Correct. |
| `capabilities.audio_input` | 663 | **DOCS** | `audioInput` ([`src/catalog.ts:210`](../src/catalog.ts#L210)) | Correct. |
| `capabilities.pdf_upload` | 663 | **DOCS** | `pdfUpload` ([`src/catalog.ts:211`](../src/catalog.ts#L211)) | Correct. |
| `capabilities.reasoning` | 663 | **DOCS** | `reasoning`; never expanded into seven levels ([`src/catalog.ts:195,212`](../src/catalog.ts#L195)) | Correct intent; unknown ladders are handled as Auto-only in the current source (see `reasoning-compatibility.md` §3). |
| `capabilities.tool_calling` | 663 | **DOCS** | `toolCalling` ([`src/catalog.ts:214-216`](../src/catalog.ts#L214-L216)) | Correct. |
| `capabilities.parallel_tool_calls` | 663 | **DOCS** | `parallelToolCalls` ([`src/catalog.ts:217-219`](../src/catalog.ts#L217-L219)) | Correct mapping; the adapter never sends `parallel_tool_calls`. |
| `capabilities.structured_output` | 663 | **DOCS** | `structuredOutput` ([`src/catalog.ts:220-222`](../src/catalog.ts#L220-L222)) | Correct. |
| `capabilities.batch_api` | 663 | **DOCS** | **Ignored** — no `batchApi` field anywhere in `src/` | Informational gap. Not needed by a chat adapter, but the capability is not exposed. |
| `reasoning_efforts` | **243** | **OPENAPI** — [`nano-gpt.com/openapi.json`](https://nano-gpt.com/openapi.json) `Model.reasoning_efforts`: exact accepted values; omitted for fixed-reasoning, toggle-only, or undocumented models. The enum is all seven values. The docs bundle (`llms-full.txt`) omits this field, which made it look undocumented. | `CatalogModel.reasoningEfforts` ([`src/catalog.ts:194,213`](../src/catalog.ts#L194)) | **Correct mapping.** The field is model-level capability metadata; it is not a guarantee every route accepts every value (route `features.reasoningEfforts` narrows it). See reasoning compatibility. |
| `supported_service_tiers` | 663 | **DOCS + OPENAPI** detailed field; `Model.supported_service_tiers` enum is `flex`, `fast`, `priority`, `ultrafast`; empty means default only. Messages request docs additionally allow `standard`/`batch` as request tier names. | `CatalogModel.serviceTiers` ([`src/catalog.ts:223`](../src/catalog.ts#L223)) | Correct; empty array means default only. Live carries `ultrafast` for 3 models; the config schema accepts the union (§6). |
| `supported_batch_endpoints` | 663 | Not in model field table; batch docs use it | Ignored | Fine for chat. |
| `pricing` | 663 | **DOCS** detailed field | Normalized ([`src/catalog.ts:131-177,224`](../src/catalog.ts#L131-L177)) | Mostly correct. Units/currency handled; see pricing notes. |
| `cost_estimate` | 663 | **DOCS** (internal hint) | Ignored | Fine; not a billing quote. |
| `effective_pricing` | 83 | Mentioned in models docs; no schema table | Preferred over `pricing` when input/output exist ([`src/catalog.ts:160-166`](../src/catalog.ts#L160-L166)) | **INFERRED precedence.** Docs tell clients to read both but do not state which wins. `pricingSource` records the choice. |
| `subscription` | 663 | **Not documented in the models field/schema tables** | `included`, `inputTokenMultiplier`, `note` mapped ([`src/catalog.ts:227-233`](../src/catalog.ts#L227-L233)) | Live-only. Multiplier is a billing hint, not a price. |
| `icon_url` | 653 | **DOCS** | Ignored | Fine. |
| `category` | 604 | **DOCS** | `category`; `Decisions` special case ([`src/catalog.ts:234,245-248`](../src/catalog.ts#L234)) | Correct. |
| `open_weights` | 434 | Not in models field table | `openWeights` ([`src/catalog.ts:235`](../src/catalog.ts#L235)) | Live-only, informational. |
| `providers` | 283 | **Not documented as a model field**; provider-selection docs explicitly say **do not** rely on `/models` to determine provider-selection support | `CatalogModel.providers` ([`src/catalog.ts:237`](../src/catalog.ts#L237)); exposed by the RPC ([`src/rpc.ts:257`](../src/rpc.ts#L257)) | **Do not present as selectable-provider authority.** It is a hint only. The authoritative answer is `GET /api/models/:canonicalId/providers` (`supportsProviderSelection`). |
| `aliases` | 78 | **OPENAPI** `Model.aliases`: legacy discovery IDs for a renamed model, present in detailed output | `aliases`, used for lookup ([`src/catalog.ts:236,365,378`](../src/catalog.ts#L236)) | Correct. The adapter resolves an alias to the canonical record and sends the canonical id; that is consistent with NanoGPT's canonical-ID policy, but aliases are not advertised in the picker. |
| `decision_input`, `supported_endpoints` | 16 | **DOCS** Decisions page | Ignored; decision models are filtered out of chat | Correct for this adapter. |

### Pricing shape and units

Observed 2026-10-18 (all 663 records have `pricing.currency: "USD"` and
`pricing.unit: "per_million_tokens"`):

```json
"pricing": {
  "prompt": 3,
  "completion": 15,
  "cacheReadInputPer1kTokens": 0.0003,
  "currency": "USD",
  "unit": "per_million_tokens"
}
```

[DOCS: Models](https://docs.nano-gpt.com/api-reference/endpoint/models#pricing-object-structure)
confirms `prompt`/`completion` are USD per million tokens, `currency` is USD,
and `unit` is `per_million_tokens`. Cache fields are named
`...Per1kTokens`; the code multiplies them by 1,000 to normalize to per-million
([`src/catalog.ts:116-120,141-148`](../src/catalog.ts#L116-L148)). That unit
interpretation is consistent with the documented example (`0.0001` cache read
for a `2` USD/M input price), but the cache fields are not in the pricing table
itself — they appear only in response examples. Treat the unit as
**DOCS-by-example**, not schema-verified.

Two chat models (`qwen/qwen3.5-omni-flash`, `qwen/qwen3.5-omni-plus`) had no
`prompt`/`completion` and carried `pricing.note: "varies_by_modality"`. The code
leaves `pricing` absent, which lets the UI distinguish "unknown" from "free"
([`src/catalog.ts:161-168`](../src/catalog.ts#L161-L168)). That is correct
behavior; a zero price would have been a worse answer.

Ignored media pricing fields (7 records each for `video_request`/`audio_input`)
and `pricing.note` are not relevant to text chat and are not mapped.

`effective_pricing` (83 records) uses `per_1k_tokens` and fields named
`inputPer1kTokens`/`outputPer1kTokens`; the code also multiplies them by 1,000
([`src/catalog.ts:133-136,150-160`](../src/catalog.ts#L150-L160)). The model-level
`effective_price` shape was present in the live sample; the `list_price` half is
ignored by design because the code prefers `effective_price`. This precedence is
an inference, not a documented rule.

### Representative live records

`openai/gpt-5.4` (selected fields):

```json
{
  "id": "openai/gpt-5.4",
  "owned_by": "openai",
  "context_length": 1050000,
  "max_output_tokens": 128000,
  "architecture": {"input_modalities": ["text","image"], "output_modalities": ["text"]},
  "capabilities": {"vision": true, "reasoning": true, "tool_calling": true,
                   "parallel_tool_calls": false, "structured_output": true,
                   "pdf_upload": true, "batch_api": true},
  "reasoning_efforts": ["none","low","medium","high","xhigh"],
  "supported_service_tiers": ["flex","fast","priority"],
  "pricing": {"prompt": 2.5, "completion": 15,
              "cacheReadInputPer1kTokens": 0.00025,
              "currency": "USD", "unit": "per_million_tokens"},
  "subscription": {"included": false, "inputTokenMultiplier": 1,
                   "note": "Not included in subscription"}
}
```

`fireworks/ember-1` has `max_output_tokens: null`, empty service tiers, a
`cacheReadInputPer1kTokens` field, and a provider hint; the adapter turns the
null limit into "unknown" rather than inventing one.

## 3. Provider discovery

[DOCS: Provider Selection](https://docs.nano-gpt.com/api-reference/miscellaneous/provider-selection)
documents `GET /api/models/:canonicalId/providers`, with `/` in the model ID
encoded as `%2F`, and says the endpoint is **not** under `/api/v1`. The live
probes above confirm the path, anonymous access, and both supported and
unsupported answers.

Documented important semantics:

* Provider selection applies only when the response says
  `supportsProviderSelection: true`.
* `supportsProviderSelection` is exposed **only** by this endpoint; do not infer
  it from `/api/v1/models` ([provider-selection lines 31-33](https://docs.nano-gpt.com/api-reference/miscellaneous/provider-selection#when-provider-selection-applies)).
* `defaultPrice` is used when no provider is selected; provider `pricing`
  includes selection markup; fields ending in `Per1kTokens` are USD per 1,000
  tokens; `effectivePricing.effective_price` describes routing-effective rates.
* `features` may contain `toolCalling`, `structuredOutput`, `imageInput`,
  `promptCaching`, `reasoningEfforts`, and `reasoningAlwaysOn`.

Live supported response shape (Kimi K2.6, truncated):

```json
{
  "canonicalId": "moonshotai/kimi-k2.6",
  "displayName": "Kimi K2.6",
  "supportsProviderSelection": true,
  "defaultPrice": {"inputPer1kTokens": 0.00043225,
                   "outputPer1kTokens": 0.00182,
                   "cacheReadInputPer1kTokens": 0.0000728},
  "defaultEffectivePricing": {"effective_price": {...}, "pricing_type": "observed",
                              "currency": "USD", "unit": "per_1k_tokens"},
  "providers": [
    {"provider": "runware", "available": true,
     "pricing": {"inputPer1kTokens": 0.000567,
                 "outputPer1kTokens": 0.00288225,
                 "cacheReadInputPer1kTokens": 0.00012285},
     "maxInputTokens": 262144, "maxOutputTokens": 131072,
     "features": {"toolCalling": true, "imageInput": false, "promptCaching": true}}
  ]
}
```

Unsupported response shape (`openai/gpt-5.4`):

```json
{"canonicalId":"openai/gpt-5.4","supportsProviderSelection":false,
 "providerDetails":[],"message":"This model does not support provider selection",
 "defaultPrice":{...}}
```

The parser ([`src/discovery.ts:91-161`](../src/discovery.ts#L91-L161)) reads
`providers`, `canonicalId`, `displayName`, `supportsProviderSelection`,
`defaultPrice`, and route `pricing`/`effectivePricing`/`features`. It converts
per-1k values to per-million and marks `priceIncludesMarkup: true`, matching the
documented markup inclusion. It handles the unsupported 200 answer as "ok with
no route rows"; 404/405 is also mapped to "unsupported".

Findings:

1. **Provider price preference is inverted vs the catalog normalizer.**
   [`src/discovery.ts:99-102`](../src/discovery.ts#L99-L102) prefers
   `providers[].pricing` (list rate) and only falls back to
   `effectivePricing.effective_price`. The provider-selection docs describe
   `effectivePricing.effective_price` as the effective rate used for routing,
   including discounts. The catalog normalizer does the opposite (effective
   first). The UI can therefore show a list/sticker price where an effective
   promotional price exists. This is an implementation choice, not a documented
   contradiction, but it should be labeled and made consistent.
2. **`privacy` and `region` are not parsed from the live shape.**
   [`src/discovery.ts:156-157`](../src/discovery.ts#L156-L157) expects strings;
   live rows return `privacy: {classification: ...}` and
   `region: {code,label}`. The values are silently omitted. The docs' provider
   row table does not list these fields, so this is an optional display gap, not
   a contract violation.
3. **`distillationPolicy`, `uptime`, `cacheReadRate`, `promoDiscountPct`, and
   high-context provider prices are ignored.** They are documented or live
   extras; ignoring them does not affect routing, but provider-specific
   high-context prices are not surfaced in the UI.
4. **Model-level `providers` is not provider-selection authority.** The model
   catalog's `providers` array is only a hint; the docs explicitly say not to
   rely on it. The RPC exposes it ([`src/rpc.ts:257`](../src/rpc.ts#L257)); the
   settings page should not present it as the set of selectable providers
   without first resolving the discovery endpoint.

## 4. Model suffixes

Source: [DOCS: Model Suffixes](https://docs.nano-gpt.com/api-reference/miscellaneous/model-suffixes)
(fetched 2026-10-18). The page separates routing suffixes, provider suffixes,
web-search suffixes, memory, PII redaction, reasoning effort, thinking, and
official/original route suffixes.

### Routing and provider suffixes

| Suffix family | Documented behavior | Implementation |
| --- | --- | --- |
| `:speed` / `:fast` | Best estimated completion time (TTFT + TPS). | `routing.mode: "speed"` sends body `provider.sort: "speed"` for Chat; Messages appends `:speed`. No separate `fast` mode is needed because it is an alias. |
| `:throughput` | Highest tokens/s. | `mode: "throughput"` / body sort; Messages suffix. |
| `:latency` | Lowest TTFT. | `mode: "latency"` / body sort; Messages suffix. |
| `:price` / `:cheap` / `:floor` | Lowest estimated request cost. | `mode: "price"` / body sort; Messages suffix. Alias names are not exposed separately. |
| `:tools` | Route to a tools-capable provider path. | **Not implemented.** `ROUTING_MODES` has no tools mode; no `provider.require_parameters` control is exposed ([`src/config.ts:38`](../src/config.ts#L38), [`src/protocols/common.ts:187-306`](../src/protocols/common.ts#L187-L306)). |
| `:caching` / `:cache` / `:cached` | Require a cache-capable provider; same as top-level `caching: true`; not cache annotation. | `routing.caching: true` sends body `caching: true` for Chat; Messages appends `:caching`. Aliases are not needed. |
| Provider suffix, e.g. `model-id:cerebras` | Trailing public provider ID; case-insensitive; billed like explicit selection. | Not generated. The implementation uses `X-Provider` (documented as clearer) and never appends a provider suffix. |
| `:official` / `:original` | Model-specific route aliases. | Not implemented; users can enter the exact catalog ID. |

### Web-search suffix families

The docs list 27 choices: `:online`, `online/native`, `online/linkup`,
`online/linkup-deep`, `online/tavily`, `online/tavily-deep`, `online/brave`,
`online/brave-deep`, `online/sofya`, `online/exa-fast`, `online/exa-auto`,
`online/exa-neural`, `online/exa-deep`, `online/exa-deep-reasoning`,
`online/exa-instant`, `online/kagi`, `online/kagi-web`, `online/kagi-news`,
`online/kagi-search`, `online/perplexity`, `online/perplexity-deep`,
`online/valyu`, `online/valyu-deep`, `online/valyu-web`,
`online/valyu-web-deep`, `online/firecrawl`, `online/firecrawl-deep`.

[`src/config.ts:53-79`](../src/config.ts#L53-L79) now includes all 27 documented
choices, including `:online/sofya` and the four `:online/valyu*` values. The
earlier omission was a UI gap, not a serializer bug.

The implementation appends the chosen suffix to the model id for Chat and
Responses ([`src/protocols/common.ts:297-306`](../src/protocols/common.ts#L297-L306))
and for Messages in its suffix list ([`src/protocols/messages.ts:234-236`](../src/protocols/messages.ts#L234-L236)).
Docs say web-search suffixes can compose with memory and reasoning-exclude; the
plugin's composition with `:thinking` and route suffixes is the normal additive
form. Web search is billed separately (docs), and the adapter adds a warning to
that effect.

The docs also document a **body** web-search control
(`web_search.enabled`, `webSearch`, legacy `linkup`) and say body configuration
takes precedence over a suffix. The plugin models only the suffix; `extraBody`
can carry a raw `web_search` object but there is no first-class, validated UI
control and no precedence handling. This is a documented-advanced-control gap,
not a claim that the suffix is wrong.

### Memory, redaction, and reasoning suffixes

| Suffix | Docs | Implementation |
| --- | --- | --- |
| `:memory`, `:memory-<days>` | Context Memory. | Not implemented in this text adapter. |
| `:redaction` / `:redacted` / `:piiredaction` / `:piiredacted` | PII redaction. | Not implemented. |
| `:reasoning-effort/none/low/medium/high/xhigh/max` | Request shortcut for effort; **six** values only; `minimal` is body-only; unknown values are not stripped; rightmost wins. | Not emitted. The adapter always uses the protocol body field, including for `minimal` and `max`, which is the documented primary form. |
| `:thinking`, `-thinking`, `:<number>` on Anthropic thinking IDs | Model-specific identity/aliases; not universal; numeric budget must be below `max_tokens`. | Catalog IDs containing `:thinking` are preserved as distinct models; the adapter never appends `:thinking` itself. Numeric thinking budget is not implemented. |
| `:reasoning-exclude` | Hide reasoning output on Chat Completions / Text Completions; does not disable compute. | Not appended; Chat/Responses use the documented body `reasoning.exclude`. Messages has no supported hide path in the adapter. |

### Conflict rules

[DOCS](https://docs.nano-gpt.com/api-reference/miscellaneous/model-suffixes#conflict-rules)
forbids:

* routing preference suffixes with `X-Provider`, body `provider`, or a provider
  model suffix;
* `:tools` with a routing preference suffix, `X-Provider`, body `provider`, a
  provider suffix, or `caching: true`;
* `:caching`/`:cache`/`:cached` with `:tools`, `X-Provider`, body `provider`, a
  provider suffix, or another routing preference suffix.

Implementation checks:

* `caching: true` + `routing.mode: "provider"` throws
  ([`src/protocols/common.ts:198-204`](../src/protocols/common.ts#L198-L204)).
* `stickyProvider` without `caching` throws
  ([`src/protocols/common.ts:210-212`](../src/protocols/common.ts#L210-L212)).
* `routing.provider` is only accepted with `mode: "provider"`
  ([`src/config.ts:521`](../src/config.ts#L521)).
* No `:tools` mode exists, so the `:tools` conflicts cannot arise.
* Chat keeps both routing forms in the body: a routing goal is
  `provider.sort` and caching is top-level `caching: true`. Chat therefore
  **does allow** `caching: true` together with a routing goal. Responses and
  Messages represent both as model suffixes, where the docs forbid mixing
  `:caching` with another routing preference suffix; the source rejects that
  combination for those two transports
  ([`src/protocols/common.ts:198-208`](../src/protocols/common.ts#L198-L208)).
* The helper now takes the selected protocol and only uses Chat body fields on
  Chat; Responses/Messages get suffix routing. This closes the earlier Responses
  body-routing defect.

## 5. Protocols

### Endpoints and model compatibility

| Protocol | Endpoint | Model applicability | Code |
| --- | --- | --- | --- |
| Chat Completions | `POST /api/v1/chat/completions` | The catalog is a text-chat catalog; docs do not gate it per model. | Default protocol ([`src/protocols/chat.ts`](../src/protocols/chat.ts)). |
| Chat legacy variant | `POST /api/v1legacy/chat/completions` | Same models; response uses `reasoning_content`. | **Not implemented.** |
| Chat merged-thinking variant | `POST /api/v1thinking/chat/completions` | Same models; reasoning merged into `content`. | **Not implemented.** |
| Responses | `POST /api/v1/responses` | Docs repeatedly say "compatible models"; there is no catalog flag for Responses support. | Selectable globally/per model ([`src/protocols/responses.ts`](../src/protocols/responses.ts)); no compatibility gate. |
| Anthropic Messages | `POST /api/v1/messages` | Docs: `model` is "any NanoGPT model, including non-Anthropic models"; NanoGPT translates internally. | Selectable globally/per model ([`src/protocols/messages.ts`](../src/protocols/messages.ts)). |

Consequences:

* Messages can legitimately be used with non-Anthropic catalog models; the code
  comment saying so is supported by the docs.
* Responses is **not documented as universal**. The adapter lets a user select it
  for any model; the upstream may reject or downgrade. This should be described
  as "implemented but unverified per model", not as universal support.
* Chat is the safe default; the plugin uses it by default
  ([`src/config.ts:273`](../src/config.ts#L273)).

### Request-field differences

| Concern | Chat Completions | Responses | Anthropic Messages | Code status |
| --- | --- | --- | --- | --- |
| Effort | top-level `reasoning_effort`; nested `reasoning.effort` accepted, top-level authoritative | `reasoning.effort` | `output_config.effort` for enabled levels | Correct per protocol ([`src/reasoning.ts:330-371`](../src/reasoning.ts#L330-L371)). |
| Disable reasoning | `reasoning_effort: "none"` where legal | `reasoning.effort: "none"` | `thinking: {type: "disabled"}`; `output_config.effort` has no `none` | Correct. |
| Hide output | `reasoning.exclude: true` | `reasoning.exclude: true` | No documented hide field; the adapter does not serialize hide and adds a warning | Chat/Responses correct; Messages is explicitly unsupported with a warning. |
| Tools | nested `tools[].function` | flat `tools[]` with `name`/`parameters` | `input_schema` | Correct shapes ([`src/protocols/common.ts:112-145`](../src/protocols/common.ts#L112-L145)). |
| Tool result | `role: tool`, `tool_call_id` | `function_call_output` | user-role `tool_result` | Correct. |
| Max tokens | `max_tokens` | `max_output_tokens` (minimum 16) | required `max_tokens` | Correct names; Responses does not enforce the documented minimum 16. |
| Stop | `stop` | not documented | `stop_sequences` | Responses throws before HTTP; correct. |
| Temperature/top_p | documented | not supported by reasoning-capable models | documented | Responses suppresses when the model is reasoning-capable and the effort is not `none`; non-reasoning models still receive them. Messages suppresses on active reasoning. |
| Provider routing | `X-Provider`, body string/object, suffixes | `X-Provider`, suffixes (no body `provider` or top-level `caching` in schema) | provider docs do not list `X-Provider`; suffixes are the only documented routing form found | Chat body routing; Responses/Messages use suffixes and X-Provider. Messages X-Provider remains unverified. |
| Caching | top-level `caching`, `:caching` suffix | `:caching` suffix; no top-level `caching` in schema | `:caching` suffix; explicit cache controls for Claude | Chat body field; Responses/Messages suffix. Correct per documented shape; Messages suffix behavior is still unverified. |
| Service tier | `service_tier` enum auto/default/flex/fast/priority | same enum | also `standard`, `batch` documented on the Messages page | Protocol-aware allowlists in the current source; see §6. |
| Billing override | body `billing_mode`/`billingMode`, `X-Billing-Mode` | body/header | body aliases accepted "all endpoints" | Header on all protocols, plus body `billing_mode` on Chat/Responses; documented forms. |
| Prompt caching | `promptCaching`/`prompt_caching` helper | `prompt_cache_key` | `cache_control` + optional `anthropic-beta` | Implemented per protocol; Responses `prompt_cache_key` is documented. |
| Usage | `prompt_tokens`/`completion_tokens`, details | `input_tokens`/`output_tokens`, details | `input_tokens`/`output_tokens`, cache fields | Normalizers match docs ([`src/usage.ts:38-112`](../src/usage.ts#L38-L112)). |
| Streaming | `data:` SSE with `delta.reasoning` / legacy `reasoning_content` | named Responses events | named Anthropic events | Translators handle the standard shapes. |

### Streaming and usage shapes

| Protocol | Streaming framing | Reasoning stream | Usage shape |
| --- | --- | --- | --- |
| Chat Completions | `data:` SSE chunks; `[DONE]` terminator; `stream_options.include_usage` | `delta.reasoning` (or legacy `delta.reasoning_content`) | `prompt_tokens`, `completion_tokens`, `total_tokens`, `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`, cache fields |
| Responses | Named SSE events (`response.created`, `response.output_item.*`, `response.reasoning.delta`, `response.completed`) | `response.reasoning.delta` / reasoning output items | `input_tokens`, `output_tokens`, `total_tokens`, `input_tokens_details.cached_tokens`, `output_tokens_details.reasoning_tokens` |
| Anthropic Messages | Named SSE events (`message_start`, `content_block_start`, `content_block_delta`, `message_delta`, `message_stop`) | `thinking` blocks / `thinking_delta` / `signature_delta` | `input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens` |

The translators ([`src/stream/chat.ts`](../src/stream/chat.ts),
[`src/stream/responses.ts`](../src/stream/responses.ts),
[`src/stream/messages.ts`](../src/stream/messages.ts)) handle these standard
shapes. The legacy Chat base path is documented but not implemented; the
standard Chat parser already accepts both `reasoning` and `reasoning_content`
response fields.

### Same model through all three?

* Messages: docs explicitly say any NanoGPT model, so yes for the protocol
  surface. Reasoning `output_config.effort` support may still be route-specific;
  do not claim all efforts work through Messages for every model.
* Chat: the catalog is the text catalog, so it is the expected universal path.
* Responses: only "compatible models"; no per-model flag was found in the
  catalog or docs. The adapter has no gate. Treat this as **NOT VERIFIED per
  model**, and do not put a universal "all models support Responses" claim in
  user documentation.

## 6. Billing, usage, service tiers

### Balance

[DOCS/OPENAPI: Check Balance](https://docs.nano-gpt.com/api-reference/endpoint/check-balance)
documents `POST /api/check-balance` and this 200 schema:

```json
{
  "usd_balance": "129.46956147",
  "nano_balance": "26.71801147",
  "nanoDepositAddress": "nano_..."
}
```

Both balance values are **strings**. The current source reads both the
documented snake_case names and camelCase fallbacks, accepts numeric strings
through `optionalNumeric`, and reads `nanoDepositAddress`
([`src/usage.ts:249-293`](../src/usage.ts#L249-L293);
[`src/discovery.ts` connection-test parser](../src/discovery.ts#L387-L393);
[`src/catalog.ts:49-62`](../src/catalog.ts#L49-L62)). This now matches the
documented shape; it was a parser defect during this research and was corrected
in the current working tree.

Live status: route exists (405 without POST, 401 malformed key with an invalid
Bearer). A successful authenticated 200 body could not be observed without a
key, so the corrected parser remains **DOCS-tested, not live-tested**.

### Usage

[DOCS: Usage](https://docs.nano-gpt.com/api-reference/endpoint/usage) documents
`GET /api/v1/usage`, default last 30 UTC days, with `totals`:
`requests`, `costUsd`, `refundedUsd`, `netCostUsd`, `inputTokens`,
`outputTokens`, `reasoningTokens`, `totalTokens`, plus `byDay`/`byModel`/
`byDayModel`. The current implementation builds the documented query
(`from`, `to`, `scope=current_key`, `group_by=day,model`) with a default last-30-
UTC-day range ([`src/usage.ts:221-226,299-336`](../src/usage.ts#L221-L226)) and
reads `totals` (or the root) plus `byModel`; it does not surface `byDay`. That is
a UI scope limitation, not a wire mismatch.

Live status: `401 missing_api_key` without auth; authenticated shape not
observed.

### Subscription usage

[DOCS/OPENAPI: Subscription Usage](https://docs.nano-gpt.com/api-reference/endpoint/subscription-usage)
documents `GET /api/subscription/v1/usage` (alias `/api/v1/subscription/usage`).
The response has:

* `active`, `state`, `period`, `routing`
  (`recommendedMode`, `reason`, `subscriptionQuotaAvailable`);
* `limits`: flat caps, e.g. `{dailyInputTokens: number|null,
  weeklyInputTokens: number|null, dailyImages: number|null}`;
* **top-level quota objects** `dailyInputTokens`, `weeklyInputTokens`,
  `dailyImages` (and optional `tokens`) with
  `{used, remaining, percentUsed, resetAt, degraded}`.

The current source reads the **top-level quota objects** first, then falls back
to older nested `limits` records, and uses flat `limits[id]` as a cap when a
window object has no `limit`/`total`
([`src/usage.ts:347-406`](../src/usage.ts#L347-L406)). It also handles
`period.currentPeriodEnd`, `period.end`, and a top-level `currentPeriodEnd`.
This matches the documented shape; it was a parser defect during this research
and was corrected in the current working tree.

Live status: `401 missing_api_key` without auth; authenticated shape not
observed, so this parser remains **DOCS-tested, not live-tested**.

### Service tiers

[DOCS: Models service tiers](https://docs.nano-gpt.com/api-reference/endpoint/models#discovering-service-tier-support)
documents `supported_service_tiers` values `flex`, `fast`, and the legacy
`priority` alias; an empty array means default only. Chat/Responses accept
`service_tier` values `auto`, `default`, `flex`, `fast`, `priority`. The
Messages page additionally lists `standard` and `batch`.

Live 2026-10-18 distributed tiers as:

| `supported_service_tiers` | Models |
| --- | ---: |
| `[]` | 550 |
| `["flex"]` | 54 |
| `["flex","fast","priority"]` | 45 |
| `["fast","priority"]` | 11 |
| `["flex","fast","priority","ultrafast"]` | 3 |

`ultrafast` is **not in the docs-bundle models page or the Chat request enum**,
but it is live on `openai/gpt-6.1-sol`, `openai/gpt-6.1-sol-pro`, and
`openai/gpt-sol-latest`, and the public `Model.supported_service_tiers` schema
lists it.
The public `Model.supported_service_tiers` enum is `flex`, `fast`, `priority`,
`ultrafast` ([nano-gpt.com/openapi.json](https://nano-gpt.com/openapi.json));
`standard`/`batch` are Messages request values, not model-catalog tier values.
The current source uses protocol-aware allowlists
([`src/protocols/common.ts:262-285`](../src/protocols/common.ts#L262-L285)):

| Protocol | Accepted `service_tier` values |
| --- | --- |
| Chat Completions | `auto`, `default`, `flex`, `fast`, `priority`, `ultrafast` (live-only) |
| Responses | `auto`, `default`, `flex`, `fast`, `priority` |
| Messages | `auto`, `default`, `standard`, `flex`, `fast`, `priority`, `batch` |

For `flex`/`fast`/`priority`/`ultrafast`, the chosen tier must also appear in the
exact model's `supported_service_tiers` (or the model must advertise an empty
tier list only for default). `standard`/`batch` are not model-advertised today
and are accepted only on Messages because that is the only transport whose docs
list them. Chat's `ultrafast` acceptance is an **implemented but unverified**
extension: it is live in the catalog but absent from the Chat docs/OpenAPI enum.
No live model advertises `standard`/`batch`.

### Billing modes and pricing extras

* [DOCS: Pay-As-You-Go Billing Override](https://docs.nano-gpt.com/api-reference/miscellaneous/billing-override)
  documents body `billing_mode: "paygo"` (alias `billingMode`), header
  `X-Billing-Mode: paygo`, and accepted aliases `paygo`, `pay-as-you-go`,
  `pay_as_you_go`, `paid`, `payg`; body wins over header. The current source
  sends `X-Billing-Mode: paygo` on every protocol and additionally sends body
  `billing_mode: "paygo"` on Chat and Responses
  ([`src/protocols/common.ts:255-261`](../src/protocols/common.ts#L255-L261),
  [`src/protocols/responses.ts:218`](../src/protocols/responses.ts#L215)).
  Messages is header-only. Both representations are documented; no conflict is
  created because the header value equals the body value.
* Explicit provider selection is always pay-as-you-go and bypasses subscription
  coverage; the code warns about this for `X-Provider`
  ([`src/protocols/common.ts:188`](../src/protocols/common.ts#L188)).
* Subscription multipliers (`subscription.inputTokenMultiplier`) are **live
  only**; they are not in the models docs schema. The code maps them
  ([`src/catalog.ts:230-232`](../src/catalog.ts#L230-L232)) and should label them
  as live metadata rather than a documented billing guarantee.
* `x_nanogpt_pricing` is documented in
  [Streaming Protocol](https://docs.nano-gpt.com/api-reference/miscellaneous/streaming-protocol#x_nanogpt_pricing-in-streaming)
  with `amount?`, `cost?`, `currency?`, cache fields, and token fields.
  [`src/errors.ts` `reportedCost`](../src/errors.ts) reads only `cost`. If only
  `amount` is present, the diagnostics show no cost. That is a minor gap.
* The documented per-request billing lookup
  `GET /api/v1/usage/requests/{request_id}` is not implemented. The adapter
  records request ids in diagnostics but does not resolve a recorded charge.

## 7. Discrepancies and required changes

Severity is about impact on the plugin's claims/behavior, not NanoGPT uptime.

The following defects were identified and **corrected in the current working
tree** during this research window; keep the regression coverage, but do not
re-report them as open:

* unknown reasoning ladder produced empty `efforts` and DSH rejected it — now
  Auto-only ([`src/adapter.ts:160-193`](../src/adapter.ts#L160-L193));
* balance parser did not read documented `usd_balance`/`nano_balance` strings —
  now reads both, accepts numeric strings, and exposes the deposit address
  ([`src/usage.ts:249-293`](../src/usage.ts#L249-L293));
* subscription quota parser missed top-level quota objects — now reads them and
  falls back to the older nested shape ([`src/usage.ts:347-406`](../src/usage.ts#L347-L406));
* `SERVICE_TIERS` did not include live `ultrafast` or documented
  `standard`/`batch` — the schema now accepts the union
  ([`src/config.ts:43`](../src/config.ts#L43));
* Responses used Chat body routing — the helper is now protocol-aware and
  Responses/Messages use suffixes ([`src/protocols/common.ts:187-306`](../src/protocols/common.ts#L187-L306));
* Responses omitted documented `seed`/presence/frequency controls and suppressed
  temperature for non-reasoning models — restored with a reasoning-only guard
  ([`src/protocols/responses.ts:192-234`](../src/protocols/responses.ts#L192-L234));
* the web-search UI omitted `:online/sofya` and the four `:online/valyu*`
  choices — now included (`src/config.ts:53-79`);
* Responses did not enforce the documented 16-token `max_output_tokens` minimum
  — now rejected before HTTP (`src/protocols/responses.ts:197`);
* the generic JSON helper mapped 402 to `INVALID_REQUEST` — it now reuses the
  provider-neutral classifier and keeps 402 as `QUOTA` (`src/http.ts:121-123`).

Open items:

| # | Severity | Discrepancy | Evidence | Required action |
| --- | --- | --- | --- | --- |
| 1 | Medium | Messages routing uses `X-Provider` and routing suffixes, but the Messages page found does not document provider selection. | [`src/protocols/messages.ts:181`](../src/protocols/messages.ts#L181) | Label as unverified; probe with a budgeted key before claiming support; or restrict provider routing to Chat/Responses until verified. |
| 2 | Medium | Documented `:tools` routing and `provider.require_parameters` are not exposed; provider sort `auto`/`none`/`default` suppression is not exposed. | [`src/config.ts:38`](../src/config.ts#L38), provider-selection docs | Add a tools/parameter-compatible routing mode and a "suppress saved routing prefs" choice if the UI needs it. |
| 3 | Medium | Model-level `providers` is exposed as if it described provider selection; docs say not to rely on it. | [`src/catalog.ts:237`](../src/catalog.ts#L237), [`src/rpc.ts:257`](../src/rpc.ts#L257), provider-selection docs | Label as catalog hints; resolve provider rows through the discovery endpoint. |
| 4 | Medium | Responses has no per-model compatibility gate, although docs say only "compatible models" support the Responses transport. | [`src/protocols/common.ts:350-355`](../src/protocols/common.ts#L350-L355), [`src/protocols/responses.ts:137-154`](../src/protocols/responses.ts#L137-L154), Responses docs | Keep Chat as the default; label Responses per model as unverified until probed. |
| 5 | Low | `capabilities.batch_api` is ignored. | [`src/catalog.ts:211-222`](../src/catalog.ts#L211-L222) (no `batch_api` reference) | Either expose it as an informational capability or document the omission. |
| 6 | Low | Provider route pricing prefers list over effective price; catalog prefers effective over list. | [`src/discovery.ts:99-102`](../src/discovery.ts#L99-L102), [`src/catalog.ts:160-166`](../src/catalog.ts#L160-L166) | Pick one documented precedence, label the source, and use it consistently. |
| 7 | Low | `privacy`/`region` parser expects strings but live provider rows return objects. | [`src/discovery.ts:156-157`](../src/discovery.ts#L156-L157) | Parse `{classification}`/`{code,label}` or drop the fields. |
| 8 | Low | `reportedCost` reads only `x_nanogpt_pricing.cost`, not `amount`. | [`src/errors.ts:221-226`](../src/errors.ts#L221-L226) | Accept `cost` then `amount`; keep currency separate. |
| 9 | Low | Documented Chat variants `/api/v1legacy/chat/completions` and `/api/v1thinking/chat/completions` are not implemented, nor are `reasoning.delta_field`/`reasoning_content_compat`. | [`src/config.ts:802-811`](../src/config.ts#L802-L811) | Either implement the compatibility variants or document them as unsupported. |
| 10 | Low | `reasoningInfo` advertises `auto` for unknown ladders and known defaults, but not for a known ladder with no configured/documented default. ADR-005 says the provider-default choice remains available. | [`src/adapter.ts:160-193`](../src/adapter.ts#L160-L193), [`docs/decisions.md:76-88`](decisions.md#L76-L88) | Advertise `auto` consistently for any reasoning-capable policy, or correct ADR-005. |
| 11 | Low | The documented per-request billing endpoint `GET /api/v1/usage/requests/{request_id}` is not used. | Usage/Billing docs | Optional feature; do not claim request-level billed cost. |
| 12 | Low | Body `web_search`/`webSearch`/`linkup` controls are not first-class; only suffixes are modelled. | [`src/config.ts:99-107`](../src/config.ts#L99-L107), [`src/protocols/common.ts:302-310`](../src/protocols/common.ts#L302-L310), Chat docs | Add a validated body control if advanced web search is in scope; otherwise document suffix-only behavior. |
| 13 | Low | Chat accepts live `service_tier: "ultrafast"`, which is not in the Chat request docs/OpenAPI enum (it is in the public Model schema). | [`src/protocols/common.ts:264-267`](../src/protocols/common.ts#L264-L267), live catalog | Treat as unverified until a budgeted request proves it; otherwise omit the value from the Chat protocol allowlist. |
| 14 | Low | Messages web-search suffix is appended, but the Messages page does not document web-search suffixes. | [`src/protocols/messages.ts:234-236`](../src/protocols/messages.ts#L234-L236) | Label as unverified or restrict to Chat/Responses until probed. |

## 8. Claims in existing docs/comments that are not supported by a source

1. [docs/architecture.md:123-125](architecture.md#L123-L125) states the
   resolution order is "per-route facts, API catalog ladder, model-specific
   documented facts, explicit override, inference, unknown". The code actually
   checks **override before the API ladder**
   ([`src/reasoning.ts:154-186`](../src/reasoning.ts#L154-L186)); ADR-004
   acknowledges a "known tension" but the architecture line still states the
   other order.
2. [docs/decisions.md ADR-005](decisions.md#L76-L88) says "the native selector's
   provider-default choice remains available whenever the adapter advertises no
   default." This is only partly true: the current source advertises Auto for an
   unknown ladder (no efforts) and when a `defaultEffort` exists, but not for a
   known ladder with no configured/documented default
   ([`src/adapter.ts:160-193`](../src/adapter.ts#L160-L193)).
3. [docs/architecture.md:134](architecture.md#L134) says Messages hide is
   "refused (documented as unsupported)". The docs say `:reasoning-exclude` works
   on Chat Completions and Text Completions; they do not explicitly say Messages
   lacks it. The current source does not refuse: it omits hide and adds a
   warning ([`src/protocols/messages.ts:212-213`](../src/protocols/messages.ts#L212-L213)).
   The word "documented" is too strong and "refused" is stale.
4. [`src/reasoning.ts:25`](../src/reasoning.ts#L25) calls the hardcoded
   `DOCUMENTED_POLICIES` "verified". They are documentation-derived, not
   verified live. In particular, the Astra entry uses the **inline-update**
   limits (`low`..`xhigh`) as a model-wide ladder; the live catalog advertises
   `low`..`max` for Astra. Since the catalog wins, this is currently dormant, but
   the label is wrong and the fallback would under-advertise `max`.
5. [`src/protocols/chat.ts:7`](../src/protocols/chat.ts#L7) says Chat "accepts
   every chat model in the catalog uniformly". No source explicitly guarantees
   every model on every route; this is a reasonable but unverified product
   claim, especially when a model has route-specific restrictions.
6. [docs/decisions.md ADR-013](decisions.md#L168-L180) says DSH "does not expose
   the complete ordered conversation representation needed to replay an inline
   update at the exact position". This is stronger than the evidence: DSH does
   preserve ordered messages and a per-assistant `ReplayEnvelope`, so a future
   adapter could store per-turn effort privately and synthesize updates. The
   accurate statement is that the current adapter stores no per-turn effort and
   has no first-class update representation, so the feature is not implemented —
   not that it is impossible. See `reasoning-compatibility.md` §6.
7. [`src/config.ts:42`](../src/config.ts#L42) calls the service-tier list
   "Service tiers documented across the three NanoGPT transports". `ultrafast`
   is documented in the public `Model` schema but not in the Chat request docs;
   `standard`/`batch` are Messages-only request values. The list is a union
   across schemas, so "across the three transports" is imprecise.
## 9. Live verification log

All times UTC, 2026-10-18. No credentials, prompts, or account data are included.

```text
18:59  GET  https://api.nano-gpt.com/api/v1/models?detailed=true
       200 application/json 783766 bytes; 663 records; 647 chat models
19:08  GET  https://api.nano-gpt.com/api/v1/models
       200 application/json 61809 bytes; 663 records; basic fields only
19:00  GET  https://api.nano-gpt.com/api/models/openai%2Fgpt-5.4/providers
       200 application/json; supportsProviderSelection=false; providerDetails=[]
19:00  GET  https://api.nano-gpt.com/api/models/moonshotai%2Fkimi-k2.6/providers
       200 application/json; supportsProviderSelection=true; 33 provider rows
19:01  GET  https://api.nano-gpt.com/api/models/deepseek%2Fdeepseek-v4.1-flash-1017/providers
       200 application/json; 11 provider rows; all have features.reasoningEfforts
19:01  GET  https://api.nano-gpt.com/api/check-balance            -> 405
19:01  POST https://api.nano-gpt.com/api/check-balance (bad key)  -> 401 malformed_api_key
19:01  GET  https://api.nano-gpt.com/api/v1/usage (no auth)      -> 401 missing_api_key
19:01  GET  https://api.nano-gpt.com/api/subscription/v1/usage   -> 401 missing_api_key
19:01  POST https://api.nano-gpt.com/api/v1/chat/completions     -> 401 missing_api_key
19:01  POST https://api.nano-gpt.com/api/v1legacy/chat/completions -> 401 missing_api_key
19:01  POST https://api.nano-gpt.com/api/v1thinking/chat/completions -> 401 missing_api_key
19:01  POST https://api.nano-gpt.com/api/v1/responses (empty)    -> 400 model required
19:01  POST https://api.nano-gpt.com/api/v1/messages (empty)     -> 400 model required
19:02  GET  https://nano-gpt.com/api/v1/models?detailed=true      -> 200; same catalog size
```

## 10. Remaining limitations

* No authenticated 200 response was observed for balance, usage, subscription,
  or any inference endpoint; those shapes are **DOCS/OPENAPI**, not **LIVE**.
* No paid request was made, so Chat/Responses/Messages reasoning, tool calls,
  streaming, and usage remain wire-contract-tested but not live-verified.
* `reasoning_efforts` and `aliases` are documented in the public
  [nano-gpt.com/openapi.json](https://nano-gpt.com/openapi.json) `Model` schema
  but omitted from the docs bundle. `subscription`, model-level `providers`,
  `capabilities`, and `open_weights` appear live but are not in that schema;
  treat those as live-observed and additive.
* NanoGPT's docs and OpenAPI disagree on whether `max` is in the Chat/Responses
  effort enum; see reasoning compatibility.
* Catalog counts change. Re-fetch before quoting 663/647 or any model example.
