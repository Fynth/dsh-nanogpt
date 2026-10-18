/**
 * Token accounting and authenticated account views.
 *
 * Token counts are normalized into DSH's disjoint model: uncached input,
 * cache-read input, cache-write input, output, and an optional reasoning
 * subtotal. Missing provider counters stay missing. Balance, usage, and
 * subscription views are read only from authenticated endpoints; the model
 * catalog is never treated as balance evidence.
 *
 * @module dsh-nanogpt/usage
 */
import type { TokenUsage } from '@deepseek-ai/dsh-llm';
import { type FetchLike } from './http.js';
import type { FailureInfo } from './shared.js';
/** Normalize a Chat Completions usage object. */
export declare function chatTokenUsage(raw: unknown): TokenUsage | undefined;
/** Normalize an Anthropic Messages usage object. */
export declare function messagesTokenUsage(raw: unknown): TokenUsage | undefined;
/** Normalize an OpenAI Responses usage object. */
export declare function responsesTokenUsage(raw: unknown): TokenUsage | undefined;
/** Account balance view. */
export interface BalanceView {
    /** USD balance, only when the endpoint named USD explicitly. */
    usd?: number;
    /** Nano (XNO) balance, only when the endpoint named it explicitly. */
    xno?: number;
    /** Nano deposit address disclosed by the documented balance response. */
    depositAddress?: string;
    /** Whether a balance was present but its unit could not be established. */
    unknownUnit: boolean;
    /** When the read completed. */
    fetchedAt: string;
    /** Endpoint that answered. */
    endpoint: string;
}
/** Aggregate usage view for the authenticated key. */
export interface UsageView {
    /** UTC range start. */
    from?: string;
    /** UTC range end. */
    to?: string;
    /** Requests counted by NanoGPT. */
    requests?: number;
    /** Gross USD cost. */
    costUsd?: number;
    /** Refunded USD cost. */
    refundedUsd?: number;
    /** Net USD cost. */
    netCostUsd?: number;
    /** Input tokens counted. */
    inputTokens?: number;
    /** Output tokens counted. */
    outputTokens?: number;
    /** Reasoning tokens counted; already included in output. */
    reasoningTokens?: number;
    /** Total tokens counted. */
    totalTokens?: number;
    /** Per-model aggregates, when returned. */
    byModel?: readonly {
        model: string;
        requests?: number;
        netCostUsd?: number;
        inputTokens?: number;
        outputTokens?: number;
        totalTokens?: number;
    }[];
    /** When the read completed. */
    fetchedAt: string;
}
/** Subscription quota view. */
export interface SubscriptionView {
    active?: boolean;
    state?: string;
    /** `subscription`, `paygo`, `unavailable`, when advice was returned. */
    recommendedMode?: string;
    /** Human-readable routing reason. */
    rationale?: string;
    /** Whether subscription quota is available, when disclosed. */
    subscriptionQuotaAvailable?: boolean | null;
    /** Normalized quota windows. */
    quotas?: readonly {
        id: string;
        used?: number;
        remaining?: number;
        limit?: number;
        percentUsed?: number;
        resetAt?: number;
        degraded?: boolean;
    }[];
    /** Current period end, when disclosed. */
    periodEnd?: string;
    /** When the read completed. */
    fetchedAt: string;
}
/** One authenticated read result, including a recoverable failure. */
export interface AccountRead<T> {
    value?: T;
    failure?: FailureInfo;
}
/** Shared authenticated-read options. */
export interface AccountReadOptions {
    origin: string;
    baseURL: string;
    apiKey: string | undefined;
    attribution: Record<string, string>;
    timeoutMs: number;
    fetch?: FetchLike;
    signal?: AbortSignal;
    /** Inclusive UTC start date (YYYY-MM-DD) for the usage read. */
    from?: string;
    /** Inclusive UTC end date (YYYY-MM-DD) for the usage read. */
    to?: string;
}
/** Build the documented usage endpoint query; NanoGPT rejects a range-less read. */
export declare function usageQuery(baseURL: string, from?: string, to?: string): string;
/** Read the account balance from the documented authenticated endpoint. */
export declare function readBalance(options: AccountReadOptions): Promise<AccountRead<BalanceView>>;
/** Read aggregate usage for the authenticated API key. */
export declare function readUsage(options: AccountReadOptions): Promise<AccountRead<UsageView>>;
/** Read subscription quota and routing advice for the authenticated key. */
export declare function readSubscription(options: AccountReadOptions): Promise<AccountRead<SubscriptionView>>;
