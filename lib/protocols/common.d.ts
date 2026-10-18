/**
 * Shared request construction for the three NanoGPT wire protocols.
 *
 * This module owns the parts that must not diverge between Chat Completions,
 * Responses, and Messages: provider routing, tool schema translation, request
 * controls, image/file projection, and historical tool-argument validation.
 * The protocol modules add only their own envelope and naming.
 *
 * @module dsh-nanogpt/protocols/common
 */
import { type GenerateOptions, type RequestMessage, type ToolSchema } from '@deepseek-ai/dsh-llm';
import type { FileAttachmentRef, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import type { AdvancedConfig, ResolvedConfig, RoutingConfig } from '../config.js';
import type { Preferences } from '../preferences.js';
import type { ReasoningPolicy, EffortSelection, WireReasoning } from '../reasoning.js';
import type { CatalogModel, Protocol, ReasoningVisibility, WireEffort } from '../shared.js';
/** One request image resolved to base64 plus its model-facing handle text. */
export interface ResolvedImage {
    /** Verified media type. */
    mediaType: string;
    /** Base64-encoded request bytes. */
    data: string;
    /** Deterministic text naming the image and its dimensions/path. */
    handle: string;
}
/** Everything one protocol serializer reads. */
export interface ProtocolContext {
    config: ResolvedConfig;
    preferences: Preferences;
    model: CatalogModel;
    policy: ReasoningPolicy | undefined;
    selection: EffortSelection;
    visibility: ReasoningVisibility;
    options: GenerateOptions;
    /** Resolve one durable file reference to its model-facing handle text. */
    resolveFileText: (ref: FileAttachmentRef) => string;
    /** Resolve one durable image to request bytes, or undefined for a text placeholder. */
    resolveImage: (ref: ImageAttachmentRef, signal?: AbortSignal) => Promise<ResolvedImage | undefined>;
}
/** A fully serialized request ready for authenticated transport. */
export interface PreparedWireRequest {
    /** Absolute endpoint. */
    url: string;
    /** Request headers, including authentication and attribution. */
    headers: Record<string, string>;
    /** JSON body. */
    body: Record<string, unknown>;
    /** Protocol used. */
    protocol: Protocol;
    /** Exact requested model id. */
    model: string;
    /** Actual effort serialized, when one was sent. */
    wireEffort?: WireEffort;
    /** Whether reasoning output was explicitly hidden. */
    excludeReasoning: boolean;
    /** Output-token cap materialized into the request. */
    maxTokens?: number;
    /** Provider routing id, when pinned. */
    provider?: string;
    /** Non-fatal validation notes for diagnostics. */
    warnings: string[];
}
/** Result of converting one message list. */
export interface ConvertedMessages {
    /** Messages after the route's tool-update projection. */
    messages: readonly RequestMessage[];
    /** Tool declarations after the route's projection. */
    tools: readonly ToolSchema[];
}
/** Read the leading text of one content-block list. */
export declare function textOfBlocks(content: readonly {
    type: string;
    text?: string;
}[]): string;
/** Normalize historical tool arguments to a valid JSON object string without losing the call identity. */
export declare function safeHistoricalArguments(raw: string): string;
/** Apply the route's tool-update projection and return declarations plus history. */
export declare function projectedMessages(options: GenerateOptions): ConvertedMessages;
/** Translate one tool declaration into Chat Completions' nested function shape. */
export declare function chatTools(tools: readonly ToolSchema[]): Record<string, unknown>[] | undefined;
/** Translate one tool declaration into Responses' flat function shape. */
export declare function responsesTools(tools: readonly ToolSchema[]): Record<string, unknown>[] | undefined;
/** Translate one tool declaration into Anthropic Messages' shape. */
export declare function messagesTools(tools: readonly ToolSchema[]): Record<string, unknown>[] | undefined;
/** Validate a public provider id before it can reach a header. */
export declare function validProviderId(id: string | undefined): id is string;
/** Routing fields, headers, and model suffixes for one request. */
export interface RoutingApplication {
    headers: Record<string, string>;
    body: Record<string, unknown>;
    /** Documented model suffixes for transports without routing body fields. */
    suffixes: string[];
    warnings: string[];
    provider?: string;
}
/**
 * Turn the selected routing controls into documented request fields.
 *
 * Chat Completions accepts the structured `provider` object plus top-level
 * `caching`/`stickyProvider`; Responses and Anthropic Messages document no
 * such body fields, so their routing goals/caching travel as the same model
 * suffixes the public suffix reference lists (`:speed`, `:throughput`,
 * `:latency`, `:price`, `:caching`). Explicit providers use `X-Provider` on
 * every transport, and the pay-as-you-go override uses `X-Billing-Mode`.
 *
 * @param routing - effective routing (model preference over profile default).
 * @param model - exact model, for tier validation.
 * @param config - connection facts.
 * @param protocol - selected wire protocol.
 * @returns body fields, headers, suffixes, and warnings.
 * @throws LlmError with `UNSUPPORTED_OPTION` for a conflicting or unsupported combination.
 */
export declare function routingApplication(routing: RoutingConfig, model: CatalogModel, config: ResolvedConfig, protocol?: Protocol): RoutingApplication;
/** Append documented model suffixes in the reference's order. */
export declare function modelWithSuffixes(modelId: string, suffixes: readonly string[]): string;
/** Select the documented web-search model suffix, when one is configured. */
export declare function webSearchModel(modelId: string, advanced: AdvancedConfig): {
    model: string;
    suffix?: string;
    warning?: string;
};
/** Merge deployment extra fields after every computed field. */
export declare function applyExtraBody(body: Record<string, unknown>, advanced: AdvancedConfig): void;
/** Effective advanced controls: model override over user preference over deployment. */
export declare function effectiveAdvanced(config: ResolvedConfig, preferences: Preferences, model: CatalogModel): AdvancedConfig;
/** Effective routing controls: model preference over user default over deployment. */
export declare function effectiveRouting(config: ResolvedConfig, preferences: Preferences, model: CatalogModel): RoutingConfig;
/** Effective protocol: model preference over user model preference over deployment. */
export declare function effectiveProtocol(config: ResolvedConfig, preferences: Preferences, model: CatalogModel): Protocol;
/** Effective max-token cap, or undefined when the caller and configuration name none. */
export declare function effectiveMaxTokens(options: GenerateOptions, config: ResolvedConfig, advanced: AdvancedConfig): number | undefined;
/** Effective temperature. */
export declare function effectiveTemperature(options: GenerateOptions, config: ResolvedConfig, advanced: AdvancedConfig): number | undefined;
/** Effective nucleus sampling. */
export declare function effectiveTopP(config: ResolvedConfig, advanced: AdvancedConfig): number | undefined;
/** Build the protocol-independent reasoning fields once. */
export declare function reasoningFields(context: ProtocolContext, protocol: Protocol): WireReasoning;
/** Whether an image should be sent as image input for this model. */
export declare function modelAcceptsImages(model: CatalogModel): boolean;
/**
 * Resolve one image block, falling back to its deterministic text placeholder
 * when the route is text-only, the occurrence was offloaded, or the attachment
 * cannot be read in this deployment.
 */
export declare function projectImage(context: ProtocolContext, block: {
    type: 'image';
    attachment: ImageAttachmentRef;
    offloaded?: true;
}): Promise<ResolvedImage | undefined>;
/** Deterministic text shown in place of an image the route cannot receive. */
export declare function imagePlaceholder(block: {
    type: 'image';
    attachment: ImageAttachmentRef;
}): string;
/** Resolve a file block to its deterministic handle text. */
export declare function projectFile(context: ProtocolContext, ref: FileAttachmentRef): string;
/** Normalize a finish reason without inventing a new one. */
export declare function finishReason(kind: 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error', failure?: {
    code: string;
    message: string;
}): {
    kind: 'stop' | 'tool-calls' | 'max-tokens' | 'aborted' | 'error';
    failure?: {
        code: string;
        message: string;
    };
};
