/**
 * Reasoning capability resolution and wire mapping.
 *
 * The resolver answers one question per exact model: which NanoGPT effort
 * values are actually selectable, what the default is, whether reasoning can
 * be disabled, and where that fact came from. It never turns a generic
 * `capabilities.reasoning: true` into seven selectable levels. The wire mapper
 * is the only place a selected level becomes `reasoning_effort`,
 * `reasoning.effort`, `output_config.effort`, or `thinking.type: disabled`.
 *
 * @module dsh-nanogpt/reasoning
 */
import { type CapabilitySource, type CatalogModel, type Protocol, type ReasoningVisibility, type WireEffort } from './shared.js';
/** An adapter-owned selection; `auto`/undefined means "omit the effort". */
export type EffortSelection = WireEffort | 'off' | 'auto' | undefined;
/** Provider-route facts that can narrow or broaden a model-level ladder. */
export interface RouteReasoningInput {
    /** Public provider id, for diagnostics. */
    provider: string;
    /** Effort values this exact route advertises. */
    efforts?: readonly WireEffort[];
    /** Whether this route cannot turn thinking off. */
    alwaysThinking?: boolean;
}
/** An explicit model-level override (deployment or user preference). */
export interface ReasoningOverride {
    /** Exact list of supported efforts. */
    efforts?: readonly WireEffort[];
    /** Explicitly declare the model non-reasoning. */
    disabled?: boolean;
    /** Provenance for UI presentation. */
    source?: CapabilitySource;
}
/** Inputs to one capability resolution. */
export interface ReasoningResolutionInput {
    /** Normalized catalog or hand-declared model. */
    model: CatalogModel;
    /** Pinned upstream route facts, when one is selected. */
    route?: RouteReasoningInput;
    /** Explicit model override from deployment configuration or preferences. */
    override?: ReasoningOverride;
    /** Deployment/profile default effort. */
    configuredDefault?: WireEffort | 'auto';
    /** Model-specific default effort from a user preference. */
    modelDefault?: WireEffort | 'auto';
    /** Whether experimental effort values may be advertised when the ladder is unknown. */
    experimental?: boolean;
}
/** Resolved reasoning capability for one exact model/route. */
export interface ReasoningPolicy {
    /** Selectable wire efforts, in escalation order. */
    efforts: readonly WireEffort[];
    /** Default effort materialized by the adapter, or undefined for the provider default. */
    defaultEffort?: WireEffort;
    /** Where the offered ladder came from. */
    source: CapabilitySource;
    /** Whether the model is documented to always reason. */
    alwaysThinking: boolean;
    /** Whether `none` is a legal, functional disable selection. */
    supportsDisable: boolean;
    /** Whether the ladder is unknown rather than disclosed. */
    unknown: boolean;
    /** Whether any offered value is an experimental inference/override. */
    experimental: boolean;
    /** Levels not confirmed by the current API catalog. */
    unverifiedLevels: readonly WireEffort[];
    /** Human-readable provenance/limitation notes. */
    notes: readonly string[];
    /** Catalog verification instant, when available. */
    verifiedAt?: string;
    /** Pinned route this policy describes, when one was selected. */
    route?: string;
}
/**
 * Resolve one model's reasoning capability.
 *
 * Priority follows the specification: explicit provider-route facts, then the
 * API catalog ladder, then model-specific official documentation, then an
 * explicit user/deployment override, then a clearly marked inference. An
 * override that widens the ladder keeps both facts visible: the offered levels
 * are the override's, and every level the catalog did not confirm is listed in
 * `unverifiedLevels`.
 *
 * @param input - exact model, optional route, override, and defaults.
 * @returns the policy, or undefined for a model with no reasoning control.
 */
export declare function resolveReasoning(input: ReasoningResolutionInput): ReasoningPolicy | undefined;
/** Failure raised before HTTP when a selection is not legal for the exact model. */
export declare class UnsupportedEffortError extends Error {
    /** Stable failure code. */
    readonly code = "UNSUPPORTED_REASONING_EFFORT";
    /** @param message - actionable explanation. */
    constructor(message: string);
}
/**
 * Map an adapter selection to a wire value.
 * `auto`/undefined stay undefined (omit the field); `off` is an explicit
 * compatibility alias for `none`, never a wire spelling of its own.
 */
export declare function normalizeEffortSelection(selection: EffortSelection, policy: ReasoningPolicy | undefined, modelId: string): WireEffort | undefined;
/** Fields a Chat Completions request carries for reasoning. */
export interface ChatReasoningFields {
    reasoning_effort?: WireEffort;
    reasoning?: {
        exclude: true;
    };
}
/** Fields a Responses request carries for reasoning. */
export interface ResponsesReasoningFields {
    reasoning?: {
        effort?: WireEffort;
        exclude?: true;
    };
}
/** Fields an Anthropic Messages request carries for reasoning. */
export interface MessagesReasoningFields {
    output_config?: {
        effort: WireEffort;
    };
    thinking?: {
        type: 'disabled';
    };
}
/** The exact reasoning representation one request will send. */
export interface WireReasoning {
    /** Effort value sent on the wire; absent when the provider default is requested. */
    wireEffort?: WireEffort;
    /** Whether returned reasoning is explicitly hidden. */
    exclude: boolean;
    /** Protocol-specific fields, ready to merge into the request body. */
    fields: ChatReasoningFields | ResponsesReasoningFields | MessagesReasoningFields;
}
/**
 * Build the protocol-specific reasoning fields for one request.
 * @param protocol - wire protocol selected for this request.
 * @param selection - DSH selection, including the legacy `off` alias.
 * @param policy - resolved model policy.
 * @param visibility - output visibility setting.
 * @param modelId - exact model id for diagnostics.
 * @returns fields to merge and the actual effort sent.
 */
export declare function wireReasoning(protocol: Protocol, selection: EffortSelection, policy: ReasoningPolicy | undefined, visibility: ReasoningVisibility, modelId: string): WireReasoning;
/** Human-readable label for a resolved source. */
export declare function capabilitySourceLabel(source: CapabilitySource): string;
