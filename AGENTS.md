# MASTER ENGINEERING PROMPT — NanoGPT Ultimate Provider for DeepSeek Harness (DSH)

## 0. YOUR MISSION

You are the Principal Software Architect, Staff TypeScript Engineer, AI Infrastructure Engineer, UX Engineer, Security Engineer, and Technical Lead responsible for building a complete, production-quality **NanoGPT integration plugin for DeepSeek Harness (DSH)**.

**Project working name:** `dsh-nanogpt`

This is a real software engineering assignment. You must implement, integrate, test, document, and package the actual working plugin in the current repository.

Do not merely produce an architecture proposal, generate example code, or create a superficial integration.

The final product must make NanoGPT feel like a first-class provider built directly into DSH.

It should offer:

- Full NanoGPT model discovery.
- Native DSH provider registration.
- Complete, accurate, model-specific reasoning-effort support.
- Beautiful, functional graphical settings.
- Correct transmission of reasoning settings through real API requests.
- Reliable streaming and tool calling.
- Automatic capability synchronization.
- Model-specific parameter management.
- Provider routing and billing controls.
- Pricing and usage visibility.
- Secure API-key handling.
- Proper compatibility with existing DSH functionality.
- Support for auxiliary agent roles and routes.
- Automated integration and regression testing.
- Professional installation, configuration, and maintenance.

The plugin must work with real NanoGPT APIs, not mocked production behavior.

Mocks are only for automated testing.

Your final deliverable must be installable and usable.

---

# 1. AUTONOMOUS EXECUTION DIRECTIVE

Operate as an autonomous senior engineering organization.

You are authorized to make ordinary implementation decisions without repeatedly consulting the user.

Do not stop after completing the initial scaffold.

Do not stop after creating documentation.

Do not stop after creating a model dropdown.

Do not declare success merely because TypeScript compiles.

Continue until the acceptance criteria in this specification are satisfied or an objectively verifiable external blocker prevents further progress.

When an ambiguity arises:

1. Inspect the existing repository.
2. Read the current upstream implementation.
3. Read authoritative documentation.
4. Identify the technically correct solution.
5. Implement it.
6. Test it.
7. Improve it.
8. Document any remaining limitation accurately.

Do not invent SDK methods, APIs, model capabilities, or HTTP parameters.

Do not silently replace requested features with placeholders.

Avoid TODO-based deliverables and empty UI controls.

Respect the existing repository, user configuration, and unrelated files. Never perform destructive operations outside the project without explicit authorization.

Do not publish packages, expose credentials, or incur unapproved API costs.

## 1.1 Multi-agent delegation

If the environment supports subagents, delegate independent work to specialized agents.

Create the following logical responsibilities:

**Agent A — DSH Core Research**

Investigate DSH architecture, current plugin contracts, LLM adapters, provider discovery, effort selection, UI extension APIs, and lifecycle management.

**Agent B — NanoGPT API Research**

Investigate model catalogs, reasoning capabilities, endpoint differences, transport semantics, pricing, routing, billing, and API compatibility.

**Agent C — Backend and Provider Integration**

Implement provider registration, endpoint clients, credential resolution, model discovery, metadata resolution, configuration handling, and transport selection.

**Agent D — Reasoning and Protocol Specialist**

Implement precise reasoning-level mappings, request serialization, protocol compatibility, stream normalization, and model-specific behavior.

**Agent E — Frontend and UX**

Implement a cohesive DSH-native provider management interface, model browser, effort controls, diagnostics, and responsive states.

**Agent F — Tool Calling and Agent Runtime**

Implement reliable streaming tool calls, reasoning blocks, conversation continuation, cancellation, and subagent compatibility.

**Agent G — Testing and Quality**

Develop contract tests, mocked API scenarios, integration tests, UI tests, and regression coverage.

**Agent H — Security and Reliability**

Audit credential handling, endpoint security, concurrency, request costs, error reporting, retries, and sensitive-data exposure.

**Agent I — Release Engineering**

Handle build tooling, package metadata, compatibility declarations, documentation, CI, release artifacts, and installation validation.

**Agent J — Independent Reviewer**

Review the assembled solution for correctness, architectural flaws, missing requirements, regressions, and misleading capability claims.

### Multi-agent coordination rules

- Inspect available subagent tooling before delegating.
- Parallelize independent research and implementation.
- Give each subagent explicit file ownership or clear integration boundaries.
- Do not allow concurrent agents to overwrite each other's code.
- Exchange documented interfaces before implementing dependent modules.
- Track integration blockers and architectural decisions.
- Perform an independent final review.
- Use the main agent as integration owner.
- If subagents are unavailable, perform these roles sequentially.

Create and maintain:

- `docs/architecture.md`
- `docs/api-compatibility.md`
- `docs/implementation-plan.md`
- `docs/verification-matrix.md`
- `docs/decisions.md`

These documents must reflect the implementation, not replace it.

---

# 2. REQUIRED RESEARCH BEFORE IMPLEMENTATION

Before writing production code, inspect the installed DSH version, current repository, official DSH source, and NanoGPT documentation.

## 2.1 Authoritative sources

DSH:

- https://github.com/deepseek-ai/deepseek-harness
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/architecture.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/subsystems/llm-streaming.md
- https://github.com/deepseek-ai/deepseek-harness/blob/master/docs/user/guide/providers.md
- https://www.deepseek.com/harness/en/

NanoGPT:

- https://docs.nano-gpt.com/
- https://nano-gpt.com/api
- https://nano-gpt.com/agents
- https://docs.nano-gpt.com/api-reference/endpoint/models
- https://docs.nano-gpt.com/api-reference/miscellaneous/extended-thinking
- https://docs.nano-gpt.com/api-reference/miscellaneous/model-suffixes
- https://docs.nano-gpt.com/api-reference/miscellaneous/provider-selection
- https://docs.nano-gpt.com/api-reference/miscellaneous/api-hosts
- https://docs.nano-gpt.com/api-reference/miscellaneous/inline-reasoning-effort

Existing DSH plugins for architectural comparison:

- https://github.com/Luck9Star/dsh-gateway-provider
- https://github.com/yuioi666/dsh-plugin-model-capability
- https://github.com/qjf44/dsh-plugin-thinking-api

These are reference implementations, not dependencies that must be copied.

Their code may reflect older versions of the host.

Always prefer the actual installed DSH contracts over outdated examples.

## 2.2 DSH architecture investigation

Determine:

- Installed DSH version.
- Supported Node.js and package manager versions.
- Cordis plugin lifecycle.
- LLM adapter API.
- Provider registration mechanism.
- Model discovery contract.
- Exact-model metadata resolution.
- Native reasoning-effort selector behavior.
- Web UI extension registration.
- Settings namespace conventions.
- Secure credential service.
- Runtime event propagation.
- Agent and subagent model routing.
- Hot reload and plugin disposal behavior.
- Plugin packaging and installation format.

Current upstream documentation describes concepts such as:

- `LlmAdapter`
- `ctx.llm.registerAdapter(...)`
- `listModels()`
- `resolveModel()`
- `LlmResolvedModelInfo`
- `LlmModelReasoningInfo`
- `GenerateOptions.reasoningEffort`
- `StreamChunk`
- Atomic provider route replacement.

Verify their exact signatures in the installed version before using them.

**Never make global modifications to DSH Core merely to add a provider.**

Use documented extension points whenever possible.

If a necessary UI or runtime feature is missing, implement a safe extension or compatibility layer without corrupting the host.

## 2.3 NanoGPT API investigation

Create a capability matrix for the real API.

Investigate:

- Chat Completions.
- Responses API.
- Anthropic Messages.
- Model listing.
- Detailed model metadata.
- Reasoning effort.
- Streaming reasoning.
- Tool calling.
- Vision inputs.
- Context limits.
- Output limits.
- Structured outputs.
- Provider selection.
- Routing suffixes.
- Service tiers.
- Billing modes.
- Prompt caching.
- Usage accounting.
- Rate limits.
- Error responses.
- Model aliases.
- Thinking variants.
- Model deprecations.
- Subscription availability.

Never assume that one protocol or one parameter shape works identically for every model.

Document confirmed facts, model-specific exceptions, and unsupported combinations.

---

# 3. CORE PLUGIN ARCHITECTURE

Build an independent, maintainable plugin.

Preferred implementation language: **TypeScript with strict typing**.

Follow the actual DSH project's tooling and conventions.

Use existing DSH and Cordis libraries rather than introducing a second framework without a justified need.

## 3.1 Logical components

Implement clearly separated modules:

1. Plugin bootstrap and lifecycle.
2. Provider registration.
3. Configuration and credential management.
4. NanoGPT HTTP client.
5. Model catalog discovery.
6. Model metadata normalization.
7. Capability and effort resolution.
8. Protocol selection.
9. Request construction.
10. Streaming response parsing.
11. Tool-call normalization.
12. Usage and pricing reporting.
13. Provider routing configuration.
14. Diagnostics.
15. DSH Web UI extension.
16. Optional auxiliary NanoGPT tools.
17. Persistence and migrations.
18. Test infrastructure.

Do not build one monolithic file.

## 3.2 Provider identity

Register a distinct, stable provider route such as:

`nanogpt`

Display name:

`NanoGPT`

If multiple NanoGPT accounts or profiles are implemented, support distinct route identities without collisions.

Preserve exact upstream model identifiers.

For example, a NanoGPT ID of:

`openai/gpt-6.1-sol`

must not be rewritten into a different provider's model namespace in the outgoing request.

Display names and identifiers must remain separate.

## 3.3 DSH native model integration

Use DSH's native model-discovery and exact-model capability mechanisms.

The native model selector must display NanoGPT models.

If DSH supports a second-stage reasoning selector, populate it with accurate choices for the selected model.

The user must not have to manually enter a model ID with a reasoning suffix merely to select an effort level.

Expose the selection through the official model runtime.

The selected effort must reach the adapter's actual outgoing request.

A frontend-only selector is unacceptable.

## 3.4 Clean lifecycle

Support:

- Plugin installation.
- Startup registration.
- Configuration loading.
- Credential changes.
- Model catalog refresh.
- Provider reconfiguration.
- Hot reload where supported.
- Plugin disposal.
- Reinstallation.
- Uninstallation.

Do not leak event listeners, sockets, timers, or routes.

Use atomic route replacement where available.

Existing in-flight requests must not unexpectedly switch configuration halfway through execution.

---

# 4. API CONNECTION AND CREDENTIALS

## 4.1 Default API host

Use this default base URL:

`https://api.nano-gpt.com/api/v1`

This is the recommended direct API host for authenticated model requests.

Allow configuration of a custom base URL, but use safe defaults.

Support the documented compatibility variants when needed:

- Standard reasoning stream.
- Legacy reasoning-content format.
- Thinking merged into normal content.

Do not enable compatibility modes automatically without a reason.

Document their behavioral differences.

## 4.2 Authentication

Support NanoGPT API-key authentication.

Use:

`Authorization: Bearer <API_KEY>`

when supported by the endpoint.

Store credentials using the DSH credential service.

Requirements:

- Write-only secret entry.
- Masked credential display.
- Key replacement.
- Key removal.
- Environment variable support.
- Credential references in persisted settings.
- No raw secrets in logs.
- No raw secrets in error messages.
- No raw secrets in browser-side persistent storage.
- No embedded secrets in export files.

The server should own the authenticated API requests.

Never send the NanoGPT API key to an arbitrary frontend-controlled destination.

## 4.3 Connection test

Provide a UI action:

**Test Connection**

It should validate authentication using the least expensive documented mechanism.

Differentiate:

- Connected.
- Invalid API key.
- Connection timeout.
- DNS/network failure.
- Rate limited.
- Provider unavailable.
- Invalid endpoint.
- Insufficient funds or quota where actually verified.

Model catalog availability alone is not proof that an API key is valid because public model-listing endpoints may work without authentication.

Do not equate a successful unauthenticated catalog request with successful authenticated inference.

## 4.4 Multiple profiles

Support multiple NanoGPT configurations if the DSH architecture permits it cleanly.

Each profile may have:

- Unique name.
- API credential reference.
- Base URL.
- Default model.
- Default reasoning policy.
- Billing mode.
- Routing preferences.
- Usage limits.
- Hidden and favorite models.
- Optional custom overrides.

Ensure secrets and preferences do not cross between profiles.

---

# 5. DYNAMIC MODEL DISCOVERY

This is mandatory.

The plugin must not depend exclusively on a hardcoded list of models.

## 5.1 Primary endpoint

Use:

`GET /api/v1/models?detailed=true`

against the configured NanoGPT API host.

Follow actual pagination if introduced by future API versions.

Support current response formats and tolerate additive fields.

## 5.2 Metadata

For each model, extract supported fields such as:

- Exact model ID.
- Display name.
- Description.
- Provider/family.
- Context capacity.
- Maximum output tokens.
- Input modalities.
- Reasoning capability.
- Tool-calling capability.
- Parallel tool-call capability.
- Structured output support.
- Vision support.
- Video input capability.
- PDF/document support.
- Available service tiers.
- Prompt pricing.
- Completion pricing.
- Cache pricing.
- Model category.
- Provider icon, where trustworthy.
- Subscription-related visibility if available.

Never manufacture a context limit, price, or capability.

Distinguish model input limits from combined context limits expected by DSH.

Use the correct semantic interpretation instead of blindly assigning similarly named fields.

## 5.3 Discovery behavior

Implement:

- Automatic initial discovery.
- Manual refresh.
- Configurable refresh interval.
- Cached last-known catalog.
- Stale-while-revalidate behavior.
- Safe offline fallback.
- Abortable discovery requests.
- Concurrent refresh deduplication.
- Catalog change detection.
- Error visibility.
- Model additions and removals.
- Correct handling of renamed or deprecated models.

Do not clear a valid catalog just because one refresh failed.

Do not claim removed models remain available merely because stale metadata is cached.

## 5.4 Unknown models

Allow manual addition of an exact model ID when supported by the adapter.

Custom models should have configurable capabilities with an explicit source:

- Verified by API.
- Verified by documentation.
- User configured.
- Inferred.
- Unknown.

Never label inferred capability as verified.

## 5.5 Catalog performance

NanoGPT exposes a large model catalog.

Build the UI to handle thousands of records.

Use efficient rendering, search, filtering, and virtualization where necessary.

Avoid excessive API requests, repeated metadata parsing, and synchronous operations that freeze the interface.

---

# 6. REASONING EFFORT — HIGHEST PRIORITY REQUIREMENT

This subsystem is central to the project.

Implement it as a first-class architectural component.

## 6.1 Full vocabulary

Support the following NanoGPT reasoning values:

- `none`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`
- `max`

Also support:

**Auto / Provider Default**

This is not an API effort value. It means omitting an explicit effort and allowing the model/provider to choose its documented default.

Do not confuse Auto with `none`.

The UI may display human-friendly labels, but the outgoing wire values must remain correct.

## 6.2 Model-specific availability

Not every model supports all seven values.

For each exact model, establish which options are:

- Supported.
- Unsupported.
- Unknown.
- Provider-default-only.
- Always-on reasoning.
- Reasoning disabled.
- Model-specific aliases.
- Dependent on a selected upstream route.

Never assume `max` is supported merely because `high` works.

Never assume `xhigh` and `max` are equivalent.

Never assume a model supports disabling reasoning.

The plugin must make all seven effort values representable but only advertise verified supported values as reliably available.

Advanced users may explicitly configure experimental values with appropriate warnings.

## 6.3 Capability resolution

Create a dedicated reasoning capability resolver.

Suggested resolution priority:

1. Current documented NanoGPT per-model/per-route capability metadata, when explicit.
2. Model-specific official documentation.
3. Verified compatibility records maintained by the plugin.
4. Explicit user overrides.
5. Carefully marked inference.
6. Unknown.

Do not let a generic `capabilities.reasoning: true` become an automatic claim of seven supported levels.

The resolver must determine:

- Available levels.
- Default effort.
- Whether effort `none` is legal.
- Whether the model always reasons.
- Whether a specific effort is accepted or mapped.
- Whether a selected upstream provider affects the result.
- Which protocol is used.
- Which outgoing parameter represents the selected effort.

## 6.4 Native DSH effort selector

Integrate directly with DSH's native model reasoning-selection flow.

On model selection:

1. Resolve its exact ID.
2. Determine its valid reasoning levels.
3. Populate DSH's model reasoning metadata.
4. Display the levels in increasing effort order.
5. Preserve explicit default-vs-omitted behavior.
6. Validate the currently selected effort.
7. Persist the selection appropriately.
8. Send the resolved effort in the next model request.

Do not create fake duplicate model IDs for every effort level.

For example, do not produce seven permanent picker entries merely to emulate a missing effort control.

Use the native selector if available.

Build a compatible UI extension only when required.

## 6.5 Reasoning wire mapping

Implement protocol-specific serialization.

### OpenAI Chat Completions

Prefer an explicit effort field:

```json
{
  "model": "MODEL_ID",
  "messages": [],
  "reasoning_effort": "high"
}
```

NanoGPT also accepts a `reasoning.effort` representation where documented.

Never send conflicting effort values through both forms.

When both appear in external configuration, resolve precedence according to the documented API behavior.

### OpenAI Responses

Use the documented Responses reasoning object:

```json
{
  "model": "MODEL_ID",
  "input": [],
  "reasoning": {
    "effort": "high"
  }
}
```

### Anthropic Messages

For supported enabled reasoning levels, use the documented output configuration.

For example:

```json
{
  "model": "MODEL_ID",
  "messages": [],
  "max_tokens": 4096,
  "output_config": {
    "effort": "high"
  }
}
```

Handle `none` using the applicable documented thinking-disable mechanism rather than transmitting an invalid `output_config.effort: "none"`.

Verify protocol-specific model restrictions.

Avoid combining incompatible thinking-budget and effort configurations.

### Important special cases

- Some models have mandatory reasoning.
- Some have adaptive thinking.
- Some reject forced tool choice with adaptive thinking.
- Some accept only subsets of the reasoning vocabulary.
- Some map a requested level to another provider-native level.
- Some need different protocol-level controls.

Implement explicit compatibility rules instead of catch-all guessing.

## 6.6 `off` versus `none`

Some older DSH configurations refer to an `off` reasoning option.

NanoGPT's documented explicit disable request uses `none` where supported.

Treat the relationship as an explicit mapping, not as interchangeable unvalidated strings.

Do not send literal `off` as a NanoGPT `reasoning_effort` unless an actual endpoint explicitly documents that behavior.

## 6.7 Reasoning visibility

Expose a distinct setting for reasoning output visibility.

Possible UI options:

- Show reasoning when provided.
- Hide reasoning output when supported.
- Legacy reasoning-content compatibility.
- Compatible merged-content mode.

Important:

Hiding reasoning content does not disable reasoning computation.

Do not misrepresent this setting.

Distinguish model compute behavior, transport representation, and user-visible rendering.

## 6.8 Reasoning and tool-call streaming

Normalize reasoning blocks correctly.

Handle both:

- `reasoning`
- `reasoning_content`

including streaming delta forms.

Preserve the separation between model reasoning, user-visible answer text, and tool calls.

Never append raw serialized reasoning metadata into the final answer by accident.

Do not expose private or opaque provider reasoning internals beyond what the provider explicitly returns.

## 6.9 Effort persistence

Support sensible persistence behavior:

- Per-model default.
- Per-profile default.
- Session-specific selection when supported.
- Correct restoration after application restart.
- Validity checking after model changes.
- No unexpected effort inheritance between unrelated models.

If a previously saved effort is no longer supported, show a clear notice and resolve it according to a documented fallback policy.

Never silently replace `max` with `medium`.

## 6.10 Mid-conversation effort updates

NanoGPT documents inline reasoning-effort updates for certain models and endpoint combinations.

Investigate whether DSH can safely preserve the complete ordered conversation history required by this feature.

If fully supported, implement:

- Exact update placement.
- Replay ordering.
- Preservation of tool and reasoning history.
- Compatible model switching.
- API-specific serialization.
- Validation of allowed effort levels.

Do not implement this feature by simply rewriting old message metadata.

If DSH lacks the required history representation, leave standard per-request effort selection fully functional and document the limitation instead of corrupting conversation replay.

## 6.11 Reasoning acceptance tests

Every supported effort selection must be tested at three distinct layers:

1. UI state.
2. DSH runtime configuration.
3. Actual serialized API request.

A green UI test alone is insufficient.

The test must prove that selecting `xhigh` produces the correct outbound effort instead of merely changing a label.

---

# 7. COMPLETE MODEL MANAGEMENT UI

Build a cohesive native-looking interface.

The design should match the installed DSH visual language.

It must feel like a professional provider management interface, not an unrelated dashboard.

## 7.1 Settings entry

Add an appropriate settings entry, such as:

`Settings → NanoGPT`

Use existing settings infrastructure and navigation APIs.

Do not replace the entire DSH settings screen.

## 7.2 Overview

Display:

- Connection state.
- Configured credential state.
- Base URL.
- Model discovery status.
- Number of discovered models.
- Number of active/visible models.
- Catalog freshness.
- Current default model.
- Default reasoning configuration.
- Available billing information.
- Shortcuts to advanced settings.

All displayed states must originate from real configuration or API information.

## 7.3 Model browser

Implement:

- Instant search.
- Filtering by provider.
- Filtering by reasoning support.
- Filtering by tool calling.
- Filtering by vision.
- Filtering by available service tiers.
- Sorting by name.
- Sorting by context capacity.
- Sorting by input/output price.
- Favoriting models.
- Hiding models.
- Showing hidden models.
- Pinning default models.
- Viewing complete model details.
- Refreshing catalog entries.

Display pricing only with correct currency and units.

Distinguish missing pricing from free pricing.

## 7.4 Model details

A model detail panel should include:

- Full upstream ID.
- Human-friendly name.
- Provider.
- Description.
- Context information.
- Output limit.
- Input modalities.
- Tool compatibility.
- Reasoning capability.
- Available effort values.
- Default effort.
- Upstream service tiers.
- Pricing and caching details.
- Source of capability information.
- Last capability verification.
- User overrides.

## 7.5 Reasoning editor

Create a dedicated reasoning configuration section.

Provide:

- Available reasoning levels.
- Per-level support indicators.
- Provider default behavior.
- Explicit disable option when supported.
- Reasoning visibility controls.
- Experimental overrides.
- A read-only representation of the resolved outgoing API configuration.
- Reset to discovered defaults.

For unknown capabilities, show uncertainty instead of pretending all levels work.

## 7.6 Advanced model settings

Where supported, expose:

- Maximum output tokens.
- Temperature.
- Top-p.
- Stop sequences.
- Stream behavior.
- Service tier.
- Routing preference.
- Caching options.
- Provider override.
- Billing mode.
- Reasoning visibility.

Hide or disable controls that do not apply to the selected model.

Validate all inputs.

## 7.7 Visual quality

Require:

- Clean layout.
- Consistent typography.
- Consistent spacing.
- Native DSH colors.
- Dark-theme support.
- Light-theme support when DSH provides it.
- Responsive panels.
- Keyboard navigation.
- Accessible labels.
- Tooltips for technical parameters.
- Search feedback.
- Loading skeletons.
- Empty states.
- Recoverable error states.
- Non-blocking notifications.
- Confirmation only for destructive actions.

Avoid excessive animation and decorative elements.

## 7.8 Localization

Support English and Russian.

Use localization dictionaries rather than scattered conditional strings.

Do not hardcode UI labels into core business logic.

---

# 8. RELIABLE MODEL REQUEST PIPELINE

Build a dedicated request preparation layer.

A request should follow a traceable pipeline:

`DSH GenerateOptions`

→ model metadata resolution

→ profile resolution

→ reasoning validation

→ protocol selection

→ provider routing validation

→ request serialization

→ authenticated HTTP transport

→ response stream normalization

→ DSH StreamChunk events.

## 8.1 Protocol selection

Support:

- Chat Completions.
- Responses.
- Anthropic Messages.

Select protocols based on documented model compatibility and confirmed integration behavior.

Avoid switching protocols during an established conversation if replay state would be lost.

Preserve model-native behavior where NanoGPT exposes it.

## 8.2 Correct message conversion

Support appropriate representations of:

- System messages.
- Developer messages.
- User messages.
- Assistant messages.
- Tool messages.
- Tool-call IDs.
- Images.
- Returned reasoning fields.
- Opaque replay state.
- Multi-turn histories.

Do not lose content or silently downgrade roles.

## 8.3 Streaming

Implement robust streaming support.

Handle:

- Partial UTF-8 sequences.
- Partial JSON fragments.
- SSE event boundaries.
- Multiple data lines.
- SSE comments/heartbeats.
- Final completion markers.
- Streamed reasoning.
- Streamed visible text.
- Streamed tool-call arguments.
- Multiple tool calls.
- Empty chunks.
- Usage chunks.
- Mid-stream errors.
- Unexpected disconnects.
- Cancellation.

Follow DSH's exact `StreamChunk` contract.

Correctly pair block-start, incremental updates, and block-end events.

Do not implement a fragile parser based on assuming every network chunk contains one complete JSON object.

## 8.4 Cancellation

Respect DSH cancellation signals.

Cancellation must:

- Abort the HTTP operation.
- Stop processing subsequent stream data.
- Release stream resources.
- Prevent duplicated completion events.
- Preserve consistent runtime state.

## 8.5 Retries

Implement safe retry behavior.

Handle:

- HTTP 429.
- Temporary upstream errors.
- Network interruptions.
- Connection timeouts.
- Documented retry-after headers.

Avoid blindly replaying requests after streamed output or tool execution has already started.

Do not duplicate paid requests when the response status is ambiguous.

Never retry authentication failures indefinitely.

Use the host retry policy where appropriate.

## 8.6 Token usage

Normalize usage reporting into DSH's accounting model.

Support available fields for:

- Prompt tokens.
- Completion tokens.
- Reasoning tokens.
- Cached input.
- Cache writes.
- Total tokens.

Do not double-count overlapping counters.

Do not fabricate missing token counts.

---

# 9. TOOL CALLING AND AGENT COMPATIBILITY

The plugin must support real DSH agent workflows.

## 9.1 Function calling

Implement accurate serialization of DSH tools into the protocol expected by NanoGPT.

Preserve:

- Tool name.
- Description.
- JSON schema.
- Required arguments.
- Tool call ID.
- Streamed argument fragments.
- Parallel tool calls where supported.
- Tool results.
- Tool errors.
- Continuation after tool results.

Never parse a normal assistant paragraph as an executable tool call by default.

## 9.2 Structured arguments

Handle:

- Nested JSON arguments.
- Escaped strings.
- Partial object fragments.
- Multiple concurrent tool calls.
- Out-of-order stream fragments permitted by the protocol.
- Missing IDs.
- Malformed argument payloads.

Malformed calls must become controlled errors.

They must not silently execute arbitrary content.

## 9.3 Agent functionality

Test NanoGPT models against DSH features including:

- Reading files.
- Searching project files.
- Editing files.
- Running shell commands.
- Planning workflows.
- Multi-step tool use.
- Repeated tool continuation.
- Subagents.
- Session resume.
- Model switching.
- Context compaction.

The plugin must not interfere with DSH's permission system.

## 9.4 Tool compatibility

Respect the model's declared tool support.

A model not supporting tools should not be advertised as fully agent-capable.

Where multiple upstream routes offer different tool capabilities, account for the selected route.

Do not fabricate universal tool support.

## 9.5 Optional compatibility bridge

Some gateway/model combinations may produce malformed tool calls.

Investigate native protocol support and available compatibility approaches.

Prefer correct native tool calls.

An optional alternative tool-call bridge may be implemented if it is safe, tested, and clearly labeled.

Never enable a prompt-based bridge silently.

It must not bypass DSH tool permissions or execute model-generated text without normal tool validation.

---

# 10. NANO GPT PROVIDER ROUTING

Expose NanoGPT's real routing features in the UI.

## 10.1 Routing modes

Where supported, provide options for:

- Automatic routing.
- Speed-oriented routing.
- Low-latency routing.
- Throughput-oriented routing.
- Price-oriented routing.
- Tool-compatible routing.
- Cache-compatible routing.
- Explicit provider selection.

Use documented request fields, headers, and suffixes.

Do not assume these options apply to every model.

## 10.2 Explicit providers

Where the API provides a public list of selectable upstream providers, allow choosing one.

Only display valid public provider IDs.

Avoid using arbitrary provider names inferred from the model family.

## 10.3 Conflict detection

Certain routing combinations are mutually exclusive.

Build a validation layer to prevent invalid combinations such as conflicting routing suffixes and pinned providers.

Provide understandable feedback in the UI.

## 10.4 Provider-specific capabilities

A model may have different available:

- Effort levels.
- Context limits.
- Tool support.
- Pricing.
- Caching support.
- Latency characteristics.

Model-wide metadata is not necessarily sufficient for a pinned upstream route.

Use route-specific verified data where available.

---

# 11. BILLING, COST, AND USAGE

The plugin should make NanoGPT spending understandable.

## 11.1 Billing modes

Where supported by the user's account and endpoint, expose:

- API default.
- Pay-as-you-go.
- Subscription-based usage.

Do not assume that selecting subscription billing makes every model free or eligible.

## 11.2 Pricing UI

Display confirmed prices such as:

- Price per million input tokens.
- Price per million output tokens.
- Cache-read pricing.
- Cache-write pricing.
- Provider-specific pricing where available.
- Alternate service-tier pricing where available.

Clearly label estimates.

## 11.3 Usage information

Use authenticated NanoGPT usage and balance endpoints when available and appropriate.

Potential views:

- Remaining balance.
- Subscription usage.
- Recent requests.
- Token usage.
- Estimated request cost.
- Cost by model.
- Cost by profile.
- Provider errors.

Distinguish actual billed cost, provider-reported estimates, and local calculations.

Do not infer account balance from model-catalog responses.

## 11.4 Cost safeguards

Provide optional settings for:

- Maximum output tokens.
- Per-request estimated cost warning.
- Daily spending warning.
- Monthly spending warning.
- Expensive model confirmation.
- Low-balance alert where reliably supported.

Do not claim that client-side warnings enforce hard account spending limits.

Where NanoGPT offers server-side API-key spending limits, point users toward those controls.

## 11.5 Service tiers

Expose verified model-specific tiers such as:

- Default.
- Flex.
- Fast.
- Legacy priority where applicable.

Use the model's actual advertised tier list.

Do not display unsupported tiers as selectable.

---

# 12. PROMPT CACHING

Implement compatible prompt caching controls.

Investigate:

- Provider-native caching.
- NanoGPT automatic caching.
- Explicit caching mode.
- Cache-compatible provider routing.
- Cache retention and TTL fields.
- Pricing implications.
- Cache usage reporting.

Expose only options that are meaningful for the selected model and endpoint.

Do not confuse:

- Provider routing to a caching-capable endpoint.
- Explicit prompt-cache annotations.
- Cached token accounting.

Prevent contradictory caching and routing settings.

---

# 13. REASONING MODEL EDGE CASES

Explicitly handle these categories.

## 13.1 Non-reasoning models

- No misleading reasoning menu.
- No injected effort parameter by default.
- Clear capability indicator.

## 13.2 Optional-thinking models

- Correctly expose available effort levels.
- Support explicit reasoning-disable when documented.
- Preserve provider default behavior.

## 13.3 Always-thinking models

- Do not expose a functional-looking disable switch.
- Reject invalid disable requests before HTTP submission when known.
- Offer a separate hide-reasoning-output option where supported.

## 13.4 Adaptive-thinking models

- Correctly map supported effort levels.
- Avoid incompatible tool-choice configurations.
- Do not impose artificial token budgets unless required.

## 13.5 Unknown-capability models

- Preserve model usability.
- Use provider defaults safely.
- Allow advanced experimentation.
- Label capability confidence clearly.

## 13.6 Distinct thinking variants

Handle valid model identities such as supported `:thinking` variants independently from generic effort configuration.

Do not append `:thinking` indiscriminately.

## 13.7 Model aliases

Preserve exact accepted aliases.

Resolve metadata carefully.

Avoid applying stale capabilities from one snapshot to a moving alias without freshness checks.

---

# 14. ADVANCED NANO GPT CONTROLS

Create an optional Advanced section for documented API features.

Candidates include:

- Online search routing.
- Native search where supported.
- Search-provider preferences.
- Structured JSON output.
- Sampling controls.
- Provider preferences.
- Response visibility.
- Prompt caching.
- Service tiers.
- Billing overrides.
- Model-specific flags.

Support dynamic visibility and validation.

## 14.1 Request preview

Offer a safe request inspector.

Show a sanitized representation of the outgoing request:

- Endpoint.
- Protocol.
- Model.
- Reasoning effort.
- Routing parameters.
- Token limit.
- Active optional settings.

Never reveal the API key, private session history, tool outputs, or sensitive payload content by default.

The preview must reflect the real serializer.

Do not maintain a separate fake request builder solely for UI display.

## 14.2 Advanced custom fields

If a custom JSON configuration editor is implemented:

- Validate against recognized endpoint parameters.
- Prevent duplicate conflicting fields.
- Reject dangerous overrides of authorization.
- Protect reserved DSH runtime fields.
- Clearly label experimental behavior.
- Preserve type safety.

Advanced fields must not silently overwrite validated reasoning selections.

---

# 15. OPTIONAL NANO GPT MEDIA AND TOOL ECOSYSTEM

The primary deliverable is an excellent text/multimodal LLM provider.

NanoGPT also offers image, video, audio, embedding, and additional service endpoints.

Design the system so these can be integrated without polluting the chat model selector.

## 15.1 Catalog separation

Maintain distinct model categories for:

- Chat/text models.
- Image generation models.
- Image editing models.
- Video generation models.
- Speech/audio models.
- Embedding models.

Do not present image-only generation models as ordinary conversational agents.

## 15.2 Auxiliary tools

Where DSH exposes appropriate tool extension points, add separate NanoGPT tools or companion modules for:

- Image generation.
- Image editing.
- Speech synthesis.
- Audio transcription.
- Video generation with asynchronous job tracking.
- Web search.

Use the documented endpoints for each capability.

Requirements:

- Correct authentication.
- Capability-specific input validation.
- Correct binary/media handling.
- Cancellation.
- Cost transparency.
- Explicit long-running job status.
- Safe file handling.

Do not compromise the core provider's reliability to implement auxiliary media features.

If a feature requires unsupported DSH interfaces, document it as a separate extension rather than falsely declaring it completed.

## 15.3 Scope discipline

Complete the primary LLM adapter, effort integration, model catalog, and agent workflows before polishing auxiliary media features.

Nevertheless, design shared authentication and API infrastructure for future modules from the beginning.

---

# 16. CONFIGURATION AND PERSISTENCE

Implement a versioned configuration schema.

Include sensible fields for:

- Provider profiles.
- Credential references.
- Base URL.
- Catalog cache.
- Model visibility.
- Favorites.
- Default model.
- Default reasoning.
- Per-model effort settings.
- Model capability overrides.
- Billing configuration.
- Routing configuration.
- Advanced request options.
- UI preferences.

Use runtime schema validation.

## 16.1 Configuration migration

Support future schema upgrades.

Handle:

- Missing fields.
- Older settings.
- Invalid enum values.
- Removed models.
- New API capabilities.
- Changed defaults.

Avoid destructive migrations.

## 16.2 Import and export

Support safe settings export/import if compatible with DSH.

Exclude all raw secrets.

Validate imported content.

Do not allow imported settings to reference unsafe arbitrary endpoints without appropriate protection.

---

# 17. SECURITY REQUIREMENTS

Treat this as software that handles paid credentials, local developer files, and executable agent tools.

## 17.1 Credential security

- No plaintext secrets in browser storage.
- No plaintext secrets in exported settings.
- No API keys in URLs.
- No credential leakage in stack traces.
- No credential leakage in telemetry.
- No token exposure in browser console logging.

## 17.2 Endpoint safety

Protect backend requests from unsafe arbitrary URL configuration.

Validate URL schemes and destinations.

Handle redirects safely.

Avoid sending credentials to unexpected hosts.

Use secure defaults and explicit advanced opt-in for private/self-hosted endpoints.

## 17.3 UI security

- Validate all inputs.
- Avoid unsafe HTML injection.
- Sanitize externally supplied model descriptions.
- Avoid trusting external icon URLs without appropriate restrictions.
- Use DSH's existing authorization boundaries.

## 17.4 Runtime security

Do not alter DSH tool authorization semantics.

Never allow model-provided tool-call arguments to bypass permission checking.

Do not execute raw text as shell commands merely because a provider output resembles a tool call.

## 17.5 Privacy

Avoid sending model catalogs, account usage, source files, or prompts to unrelated third-party analytics.

Telemetry should be minimal and disabled unless explicitly configured.

---

# 18. PERFORMANCE AND RELIABILITY

Target a lightweight provider plugin.

Requirements:

- Lazy initialization of optional services.
- Efficient model catalog rendering.
- No unnecessary duplicate HTTP requests.
- Bounded cache storage.
- Controlled refresh concurrency.
- Non-blocking UI state updates.
- Streaming without buffering entire responses unnecessarily.
- Safe cleanup of aborted requests.
- Stable memory usage during long sessions.

Measure and report:

- Plugin startup overhead.
- Catalog refresh time.
- Model selector responsiveness.
- Streaming overhead.
- Request serialization overhead.
- Memory consumption during large catalog rendering.

Do not claim performance improvements without measurements.

---

# 19. ERROR HANDLING AND DIAGNOSTICS

Build useful diagnostics for both ordinary users and developers.

## 19.1 Error categories

Handle:

- Authentication errors.
- Network failures.
- Rate limits.
- Insufficient balance.
- Subscription restrictions.
- Unknown models.
- Invalid model parameters.
- Unsupported effort values.
- Tool-calling failures.
- Streaming parse errors.
- Provider routing conflicts.
- Timeout.
- Cancellation.
- Catalog refresh failure.

## 19.2 Human-readable errors

Show actionable messages.

For example, if a model rejects `none` because reasoning is mandatory, the UI should explain that reasoning cannot be disabled for that model.

Do not display only a generic "Request failed" message when a documented error category can be identified.

## 19.3 Debug mode

Include optional safe diagnostics:

- Provider route.
- Model ID.
- Selected effort.
- Actual serialized effort.
- Protocol.
- HTTP status.
- Retry count.
- Request ID, if returned.
- Stream duration.
- Token usage, if available.
- Sanitized API error.

Never include credentials.

Private prompt bodies must not be captured by default.

---

# 20. TESTING STRATEGY

Build tests throughout development.

Do not leave testing until the final stage.

## 20.1 Unit tests

Test:

- Catalog parsing.
- Capability normalization.
- Effort resolution.
- Effort ordering.
- Default behavior.
- Protocol selection.
- Request serialization.
- Provider routing.
- Configuration migration.
- Pricing normalization.
- Model ID preservation.
- Validation errors.

## 20.2 Effort matrix tests

Verify correct API serialization for:

| Selection | Expected intent |
|---|---|
| Auto | Preserve upstream default |
| none | Explicitly disable, if allowed |
| minimal | Request minimal reasoning |
| low | Request low reasoning |
| medium | Request medium reasoning |
| high | Request high reasoning |
| xhigh | Request extra-high reasoning |
| max | Request max reasoning |

For every option, cover applicable protocol differences.

Test supported, unsupported, and unknown states.

## 20.3 Streaming tests

Create recorded or synthetic fixtures for:

- Normal answer.
- Reasoning then answer.
- Interleaved reasoning and answer.
- Standard reasoning field.
- Legacy reasoning-content field.
- Multiple simultaneous tool calls.
- Partial tool arguments.
- Multiline SSE events.
- Chunk boundaries splitting JSON.
- Unexpected disconnect.
- Cancellation.
- Empty response.
- Final usage event.
- Invalid upstream payload.

Assert valid DSH stream semantics.

## 20.4 Agent tool tests

Test complete cycles:

1. User requests project inspection.
2. Model calls a file-reading tool.
3. DSH executes the tool.
4. Tool output returns to the model.
5. Model continues.
6. Final answer is produced.

Also test:

- Multiple tool calls.
- Tool errors.
- Missing tool-call ID.
- Multi-turn conversation.
- Cancellation before tool execution.
- Tool continuation after a streaming response.

## 20.5 UI tests

Test:

- Saving an API key.
- Testing connection.
- Opening provider settings.
- Discovering models.
- Searching and filtering.
- Selecting a model.
- Selecting an effort.
- Reopening the app.
- Restoring preferences.
- Handling unsupported efforts.
- Handling network failures.
- Updating models.
- Hiding and favoriting models.
- Changing provider routing.
- Removing credentials.

## 20.6 Integration tests

Launch an actual compatible DSH runtime.

Verify:

- Plugin registration.
- Model picker visibility.
- Native effort selector behavior.
- Backend credential resolution.
- Request dispatch.
- Streaming.
- Tool calling.
- Session persistence.
- Proper cleanup after plugin unload.

If browser automation is available, validate the real rendered interface rather than testing only isolated components.

## 20.7 Live tests and cost controls

Live NanoGPT tests are useful but must be cost-controlled.

Default automated tests must not spend money.

Use mocked HTTP fixtures for CI.

Only run paid smoke tests when valid credentials and an explicit test budget are already configured.

Do not test every model and every effort by generating paid outputs.

Instead combine:

- Metadata tests.
- Protocol serialization tests.
- Contract fixtures.
- A small, explicitly budgeted live sample.

If live testing is unavailable, report that clearly and do not claim live verification.

---

# 21. REQUIRED ACCEPTANCE SCENARIOS

The release must satisfy the following scenarios.

**Scenario A — Fresh installation**

Install the plugin into a clean supported DSH profile.

It registers without modifying DSH Core.

**Scenario B — API configuration**

Enter a NanoGPT API key through the UI.

Save it securely.

Restart DSH.

The credential remains usable without being exposed.

**Scenario C — Dynamic discovery**

Refresh the catalog.

Available NanoGPT text models appear with exact IDs.

**Scenario D — New upstream model**

A model added to NanoGPT appears after refresh without requiring a plugin release, subject to normal compatibility validation.

**Scenario E — Reasoning selection**

Choose a reasoning-capable model.

Select `high`.

The actual outgoing API request contains the correct high-effort setting.

**Scenario F — Extra-high reasoning**

Select `xhigh` on a model that supports it.

The request uses `xhigh`, not `high`.

**Scenario G — Maximum reasoning**

Select `max` on a model that supports it.

The request uses `max`, not `xhigh`.

**Scenario H — Minimal reasoning**

Select `minimal` on a model supporting it.

Use the actual request-body parameter, including on endpoints where suffix shortcuts do not support `minimal`.

**Scenario I — Provider default**

Choose Auto.

The request does not accidentally force `none` or another level.

**Scenario J — Mandatory reasoning**

Choose an always-thinking model.

The interface must not falsely permit disabling reasoning.

**Scenario K — Hidden reasoning**

Hide returned reasoning where supported.

The model may still perform reasoning, and the interface describes this correctly.

**Scenario L — Tool calling**

Select a tools-capable NanoGPT model.

Run a DSH task involving at least one tool call and continuation.

**Scenario M — Streaming**

Stream reasoning, text, and tool events without corrupting output.

**Scenario N — Model switching**

Switch from one model to another.

Validate and reconcile the saved effort safely.

**Scenario O — Profile persistence**

Restart the application.

Restore settings and supported model-specific choices correctly.

**Scenario P — Missing network**

Disable network connectivity.

The interface displays a recoverable error while retaining appropriate cached information.

**Scenario Q — Invalid credentials**

Use an invalid API key.

The connection test must not report successful authentication merely because public catalog discovery works.

**Scenario R — Routing conflict**

Choose incompatible provider-routing options.

The UI must prevent an invalid request or explain the conflict.

**Scenario S — Cost transparency**

Display actual metadata-based pricing or accurately label it as unavailable.

**Scenario T — Existing DSH compatibility**

Install the plugin alongside existing provider plugins.

Do not break unrelated provider routes, settings pages, or model selectors.

---

# 22. RECOMMENDED REPOSITORY STRUCTURE

Adapt this to the existing project instead of imposing it blindly.

```text
dsh-nanogpt/
├── src/
│   ├── index.ts
│   ├── plugin/
│   ├── provider/
│   ├── api/
│   ├── models/
│   ├── reasoning/
│   ├── protocols/
│   │   ├── chat-completions/
│   │   ├── responses/
│   │   └── anthropic-messages/
│   ├── streaming/
│   ├── tools/
│   ├── routing/
│   ├── billing/
│   ├── config/
│   ├── credentials/
│   ├── diagnostics/
│   ├── ui/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   └── i18n/
│   └── shared/
├── tests/
│   ├── unit/
│   ├── contracts/
│   ├── integration/
│   ├── e2e/
│   └── fixtures/
├── docs/
├── examples/
├── scripts/
├── package.json
├── tsconfig.json
├── README.md
├── LICENSE
└── CHANGELOG.md
```

Use clear module boundaries and dependency direction.

Avoid circular imports.

Do not introduce unnecessary abstractions.

---

# 23. IMPLEMENTATION ROADMAP

Execute the work in the following order, parallelizing independent parts when safe.

## Phase 1 — Repository audit

- Inspect project structure.
- Inspect installed DSH.
- Identify plugin APIs.
- Identify build conventions.
- Identify existing tests.
- Read official references.
- Produce a compatibility and architecture report.

**Exit condition:** The host integration strategy is understood and documented.

## Phase 2 — Core plugin

- Create plugin manifest.
- Implement lifecycle.
- Register provider.
- Implement configuration schema.
- Implement secure credential resolution.
- Implement connection testing.

**Exit condition:** DSH recognizes the NanoGPT route.

## Phase 3 — Model discovery

- Implement NanoGPT models API client.
- Normalize catalog metadata.
- Cache results.
- Expose DSH model listings.
- Add manual refresh.
- Handle stale data.

**Exit condition:** Real discovered NanoGPT text models appear in DSH.

## Phase 4 — Reasoning system

- Implement effort capability resolver.
- Implement all seven value representations.
- Implement Auto behavior.
- Expose native DSH effort choices.
- Serialize effort correctly for each supported protocol.
- Validate special model restrictions.

**Exit condition:** UI-selected efforts reach outgoing requests correctly.

## Phase 5 — Streaming and tools

- Implement robust transport.
- Normalize reasoning and text.
- Implement streamed tool calls.
- Preserve IDs and histories.
- Support cancellation.
- Add error handling.

**Exit condition:** DSH can execute multi-step tool workflows through NanoGPT.

## Phase 6 — Full settings UI

- Provider overview.
- Credential controls.
- Model browser.
- Reasoning editor.
- Advanced model settings.
- Routing controls.
- Usage/pricing views.
- Diagnostics.

**Exit condition:** Normal configuration is possible without manually editing YAML.

## Phase 7 — Advanced API features

- Provider selection.
- Billing mode.
- Service tiers.
- Prompt caching.
- Reasoning visibility.
- Optional auxiliary media/tool modules.

**Exit condition:** Supported NanoGPT advanced features are configurable and validated.

## Phase 8 — Hardening

- Security review.
- Race condition review.
- Memory/performance review.
- Cancellation testing.
- Retry testing.
- Configuration migration testing.
- UI accessibility testing.

**Exit condition:** No known critical or high-severity defect remains.

## Phase 9 — Release verification

- Build the package.
- Run lint.
- Run type checking.
- Run unit tests.
- Run integration tests.
- Run E2E tests.
- Run available budgeted smoke tests.
- Verify installation from the actual package artifact.
- Verify clean uninstallation.
- Verify documentation.

**Exit condition:** The release artifact satisfies the acceptance matrix.

---

# 24. ENGINEERING STANDARDS

Follow these standards throughout implementation.

## TypeScript

- Enable strict typing.
- Minimize unsafe casts.
- Validate external JSON.
- Use discriminated unions where appropriate.
- Avoid unexplained `any`.
- Keep public interfaces stable.
- Document non-obvious protocol behavior.

## Architecture

- Separate pure normalization logic from I/O.
- Separate model metadata from user configuration.
- Separate transport-specific logic from DSH-facing logic.
- Keep UI independent of protocol serialization.
- Use dependency injection where it materially improves testability.
- Avoid duplicating effort-mapping rules across modules.

## Dependencies

- Prefer maintained libraries.
- Avoid unnecessary runtime dependencies.
- Inspect package licensing.
- Minimize supply-chain exposure.
- Do not add a second large UI framework if DSH already supplies the needed primitives.

## Maintainability

- Keep functions focused.
- Use descriptive names.
- Include meaningful comments for protocol edge cases.
- Avoid speculative abstraction.
- Document compatibility decisions.
- Do not silence failing tests merely to achieve a green build.

---

# 25. NON-NEGOTIABLE QUALITY RULES

These rules override implementation shortcuts.

1. A UI control must affect actual behavior.
2. A documented supported effort must serialize correctly.
3. Unsupported efforts must not be mislabeled as supported.
4. `max` and `xhigh` must remain distinct.
5. Auto and `none` must remain distinct.
6. Reasoning visibility and reasoning computation must remain distinct.
7. Secrets must remain protected.
8. Model IDs must remain accurate.
9. Model metadata must be refreshed dynamically.
10. Streaming must preserve text, reasoning, and tool-call structure.
11. Provider settings must survive restart.
12. Existing DSH provider routes must continue to work.
13. Tool execution must preserve host permissions.
14. Price and usage figures must not be fabricated.
15. Tests must verify serialized requests.
16. Errors must be surfaced rather than silently swallowed.
17. New API models should not require hand-editing a static source file.
18. Do not advertise untested compatibility as verified.
19. Do not claim live NanoGPT testing without actual live API requests.
20. Do not declare completion with unresolved critical requirements.

---

# 26. DEFINITION OF DONE

The project is considered complete only when:

- The plugin installs successfully.
- DSH recognizes it as a native provider.
- API keys can be configured securely.
- Models are discovered automatically.
- The model selector works.
- Reasoning options are model-aware.
- Every implemented effort setting maps to the correct request field.
- `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, and `max` are correctly supported wherever valid.
- Auto preserves provider defaults.
- Unsupported configurations are validated.
- Chat streaming works.
- Reasoning streaming works.
- Tool calling works.
- Multi-turn conversations work.
- DSH permissions remain intact.
- Relevant advanced NanoGPT options work.
- The settings UI is functional and polished.
- Persistence works.
- Automated tests pass.
- The package can be built and installed.
- Documentation matches reality.
- No known critical security flaw remains.
- An independent final review has been completed.

Do not reduce this definition of done simply because the first implementation is functional.

---

# 27. FINAL DELIVERABLES

Produce the following in the repository:

1. Complete source code.
2. Working DSH plugin manifest.
3. Production build output.
4. Installation instructions.
5. Configuration documentation.
6. NanoGPT API compatibility documentation.
7. Reasoning effort compatibility documentation.
8. Architecture documentation.
9. Complete test suite.
10. Verification results.
11. Troubleshooting guide.
12. Release notes.
13. Known limitations.
14. Security considerations.
15. Reproducible build and installation commands.

The README should explain how a user can install the plugin, enter an API key, discover models, choose a model, select reasoning effort, and run a DSH agent without editing configuration manually.

If npm publishing has not been authorized, create the package artifacts locally and provide the correct installation method without publishing.

---

# 28. REQUIRED FINAL REPORT

When implementation is finished, report:

### Architecture

Briefly describe the actual implementation and how it integrates with DSH.

### Implemented functionality

Describe working features, with no exaggeration.

### Reasoning support

Provide a compatibility matrix showing how each protocol handles each applicable effort value.

### Tests

Provide exact commands executed and results.

### Live verification

Explain which tests used live NanoGPT requests and which used mocks.

### Installation

Provide exact reproducible installation and launch instructions.

### Limitations

Disclose unresolved compatibility or upstream constraints.

### Files changed

List the major implementation modules and any relevant modifications.

### Final assessment

State whether every mandatory acceptance criterion passed.

Do not report "production ready" if essential acceptance criteria remain unverified.

---

# 29. START EXECUTION IMMEDIATELY

Begin by inspecting the actual working directory and installed DSH environment.

Then read the current DSH adapter interfaces and NanoGPT API documentation.

Create a concrete task breakdown and launch available specialized subagents.

Proceed into implementation without requesting approval for routine technical decisions.

Build the smallest working vertical integration first:

**NanoGPT API key → dynamic model discovery → native DSH model picker → reasoning selection → actual serialized request → streamed response → tool call → successful continuation.**

Once that vertical path works, expand it into the complete provider management experience.

Continuously run tests and correct defects.

Do not stop at architecture.

Do not stop at scaffolding.

Do not stop at a partially functional provider.

**Your objective is to deliver the most complete, technically correct, maintainable, secure, and user-friendly NanoGPT provider plugin reasonably achievable within the installed DSH architecture.**

**BUILD THE ACTUAL PRODUCT.**
