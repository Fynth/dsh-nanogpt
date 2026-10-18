# Configuration reference

Deployment facts live in the `llm-nanogpt` Loader row's Config (a
`cordis.patch.yml` layer or the Plugin Manager's configuration editor). User
choices live in the versioned preferences file and are edited in
**Settings → NanoGPT**. No API key is ever stored in either document.

## Connection

| Field | Default | Meaning |
| --- | --- | --- |
| `apiKeyEnv` | `NANOGPT_API_KEY` | Credential reference resolved through the DSH credentials service, then the process environment. An empty value disables authenticated requests. |
| `baseURL` | `https://api.nano-gpt.com/api/v1` | Provider base. Bare NanoGPT hosts gain `/api/v1`; `/api` gains `/v1`; custom gateway paths are preserved. |
| `displayName` | `NanoGPT` | Provider display name; the route id stays `nanogpt`. |
| `protocol` | `chat` | Default wire protocol: `chat`, `responses`, or `messages`. |
| `defaultModel` | none | Display/default hint. The real DSH default for new sessions is saved through `agentDefaultModel` from the model detail action. |
| `defaultReasoningEffort` | `auto` | Deployment fallback effort for models whose catalog/docs disclose no default. Never clamped. |
| `reasoningVisibility` | `show` | Deployment fallback: `show` or `hide`. The user preference in Settings → NanoGPT overrides it. Hide never disables reasoning compute. Anthropic Messages has no documented hide control, so hide is recorded as a warning there. |
| `experimentalEfforts` | `false` | When true and the catalog discloses no ladder, advertise all seven values as clearly labelled experimental. Unsupported values fail at the provider. |

## Limits and refresh

| Field | Default | Meaning |
| --- | --- | --- |
| `defaultMaxTokens` | none | Output cap applied when the caller/config supplies none. |
| `temperature` | none | Default sampling temperature. |
| `topP` | none | Default nucleus sampling. |
| `autoRefresh` | `true` | Refresh the catalog on mount and on the interval. |
| `refreshMinutes` | `360` | Refresh interval; `0` disables interval refreshes. A failed refresh retries after at most 5 minutes. |
| `requestTimeoutMs` | `60000` | Header/request timeout for provider and account requests. |
| `streamIdleTimeoutMs` | `300000` | Maximum silence between stream bytes. |
| `allowPrivateEndpoints` | `false` | Allow a configured endpoint whose host is loopback/private. |
| `allowInsecureEndpoints` | `false` | Allow `http:` endpoints. Keep this off for remote hosts. |
| `retryPolicy` | DSH normal policy | Passed to DSH's retry row: mode, max retries, retryable codes, backoff. The adapter never replays a request after streamed output. |

## Protocol and routing

`models[]` entries may override per exact id:

```yaml
models:
  - id: deepseek/deepseek-v4.1-flash-1017
    enabled: true
    contextWindow: 1048576
    maxTokens: 393216
    inputModalities: [text, image]
    reasoningEfforts: [none, low, high, max]
    defaultEffort: high
    protocol: chat
    routing:
      mode: provider
      provider: deepinfra
    advanced:
      maxTokens: 8192
    source: user-config
    notes: "Team default route"
```

- `routing.mode`: `auto | speed | throughput | latency | price | provider`.
- `routing.provider`: public provider id, required for `provider`; the id is
  sent as `X-Provider` and is billed pay-as-you-go.
- `routing.allowFallbacks`: `false` disables fallback for a routing goal.
- `routing.caching`: cache-capable provider routing; cannot combine with an
  explicit provider.
- `routing.stickyProvider`: requires `caching: true`; Chat sends the documented
  body field, other transports record that the field is not documented.
- `routing.billingMode`: `default | paygo`; `paygo` sends `X-Billing-Mode` (and
  the Chat body alias).
- `routing.serviceTier`: validated per transport and model:
  - Chat: `auto/default/flex/fast/priority/ultrafast`
  - Responses: `auto/default/flex/fast/priority`
  - Messages: `auto/default/standard/flex/fast/priority/batch`
- `advanced.webSearch`: documented `:online/...` suffix family; searches are
  billed separately.
- `advanced.promptCaching`: `{enabled, ttl: "5m"|"1h"}`; Chat helper, Claude
  beta/cache marker on Messages. Responses uses the documented runtime
  `prompt_cache_key` instead.
- `advanced.maxTokens`, `temperature`, `topP`, `seed`, `presencePenalty`,
  `frequencyPenalty`: per-model defaults when the caller supplies none.
- `advanced.extraBody`: safe escape hatch. Reserved runtime fields (reasoning,
  routing, store/include, authorization, model/messages/output caps, etc.) are
  refused; object-prototype keys are refused.

## Capability provenance

| Source | Meaning |
| --- | --- |
| `api` | Advertised by `GET /models?detailed=true`. |
| `api-route` | Advertised by provider discovery for a pinned route. |
| `documentation` | Model-specific official documentation used because the API was silent. |
| `verified` | A plugin verification record. |
| `user-config` | Explicit deployment/user override. |
| `inferred` | Clearly labelled experimental inference. |
| `unknown` | No ladder disclosed; provider default only. |

Unknown is not the same as “supports everything”; inferred is never presented as
verified.

## User preferences

Edited in the console, stored at `$DSH_HOME/storages/dsh-nanogpt/preferences.json`
with a schema version, a monotonic revision for optimistic concurrency, and
atomic 0600 writes. The document contains favorites, hidden/pinned ids,
per-model reasoning/protocol/routing/advanced overrides, default model/effort,
reasoning visibility, routing/advanced defaults, and UI state. It never contains a credential or the
deployment endpoint. Import validates and replaces the document; export is
secret-free.

## Environment fallback

The credential reference may resolve from the process environment when the
managed credential store has no value (for example
`NANOGPT_API_KEY`). The plugin never materializes the managed credential into
the environment and never writes a key to a URL.

## Not configurable here

Inline mid-conversation effort updates and auxiliary media endpoints require a
different DSH extension surface; they are documented limitations, not hidden
configuration.
