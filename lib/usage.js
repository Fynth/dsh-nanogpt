import { isRecord, optionalNumber, optionalNumeric, optionalString } from './catalog.js';
import { accountHeaders, requestJson, } from './http.js';
/** Maximum tokens one usage record may claim before it is treated as malformed. */
const MAX_COUNTER = 10_000_000_000;
/** Read a non-negative integer counter from either snake_case or camelCase keys. */
function counter(record, ...keys) {
    for (const key of keys) {
        const value = record[key];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_COUNTER)
            return Math.round(value);
    }
    return undefined;
}
/** Read a nested record property. */
function nested(record, key) {
    return isRecord(record[key]) ? record[key] : undefined;
}
/** Normalize a Chat Completions usage object. */
export function chatTokenUsage(raw) {
    if (!isRecord(raw))
        return undefined;
    const prompt = counter(raw, 'prompt_tokens', 'input_tokens');
    const completion = counter(raw, 'completion_tokens', 'output_tokens');
    const promptDetails = nested(raw, 'prompt_tokens_details');
    const completionDetails = nested(raw, 'completion_tokens_details');
    const cached = counter(promptDetails ?? {}, 'cached_tokens') ??
        counter(raw, 'cache_read_input_tokens', 'cacheReadInputTokens', 'cached_tokens');
    const cacheWrite = counter(promptDetails ?? {}, 'cache_write_tokens', 'cache_creation_tokens') ??
        counter(raw, 'cache_creation_input_tokens', 'cacheCreationInputTokens');
    const reasoning = counter(completionDetails ?? {}, 'reasoning_tokens') ??
        counter(raw, 'reasoning_tokens', 'reasoningTokens');
    const total = counter(raw, 'total_tokens', 'totalTokens');
    // TokenUsage has no "unknown" member for either side. A single total (or a
    // counter for only one side) cannot be split without inventing tokens, so
    // report no usage rather than 0/0.
    if (prompt === undefined || completion === undefined)
        return undefined;
    const cacheReadTokens = cached ?? 0;
    const cacheWriteTokens = cacheWrite ?? 0;
    const inputTokens = Math.max(0, prompt - cacheReadTokens);
    const outputTokens = completion;
    return {
        inputTokens,
        outputTokens,
        ...total === undefined ? {} : { totalTokens: total },
        ...cacheReadTokens === 0 ? {} : { cacheReadTokens },
        ...cacheWriteTokens === 0 ? {} : { cacheWriteTokens },
        ...reasoning === undefined ? {} : { reasoningTokens: reasoning },
    };
}
/** Normalize an Anthropic Messages usage object. */
export function messagesTokenUsage(raw) {
    if (!isRecord(raw))
        return undefined;
    const input = counter(raw, 'input_tokens');
    const output = counter(raw, 'output_tokens');
    const cacheRead = counter(raw, 'cache_read_input_tokens') ?? 0;
    const cacheWrite = counter(raw, 'cache_creation_input_tokens') ?? 0;
    const reasoning = counter(nested(raw, 'output_tokens_details') ?? {}, 'reasoning_tokens') ?? counter(raw, 'reasoning_tokens');
    if (input === undefined || output === undefined)
        return undefined;
    const inputTokens = input;
    const outputTokens = output;
    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens + cacheRead + cacheWrite,
        ...cacheRead === 0 ? {} : { cacheReadTokens: cacheRead },
        ...cacheWrite === 0 ? {} : { cacheWriteTokens: cacheWrite },
        ...reasoning === undefined ? {} : { reasoningTokens: reasoning },
    };
}
/** Normalize an OpenAI Responses usage object. */
export function responsesTokenUsage(raw) {
    if (!isRecord(raw))
        return undefined;
    const input = counter(raw, 'input_tokens');
    const output = counter(raw, 'output_tokens');
    const inputDetails = nested(raw, 'input_tokens_details');
    const outputDetails = nested(raw, 'output_tokens_details');
    const cached = counter(inputDetails ?? {}, 'cached_tokens') ?? 0;
    const reasoning = counter(outputDetails ?? {}, 'reasoning_tokens');
    const total = counter(raw, 'total_tokens');
    if (input === undefined || output === undefined)
        return undefined;
    const inputTokens = Math.max(0, input - cached);
    const outputTokens = output;
    return {
        inputTokens,
        outputTokens,
        ...total === undefined ? {} : { totalTokens: total },
        ...cached === 0 ? {} : { cacheReadTokens: cached },
        ...reasoning === undefined ? {} : { reasoningTokens: reasoning },
    };
}
/** Render one UTC calendar day as the documented YYYY-MM-DD query value. */
function utcDay(value) {
    return value.toISOString().slice(0, 10);
}
/** Build the documented usage endpoint query; NanoGPT rejects a range-less read. */
export function usageQuery(baseURL, from, to) {
    const end = to ?? utcDay(new Date());
    const start = from ?? utcDay(new Date(Date.parse(`${end}T00:00:00.000Z`) - 29 * 86_400_000));
    const query = new URLSearchParams({ from: start, to: end, scope: 'current_key', group_by: 'day,model' });
    return `${baseURL}/usage?${query.toString()}`;
}
/** Convert an unknown thrown value into a safe failure description. */
function failureOf(error) {
    if (isRecord(error) && typeof error.code === 'string' && typeof error.message === 'string') {
        const failure = isRecord(error.failure) ? error.failure : undefined;
        const status = typeof error.status === 'number'
            ? error.status
            : failure !== undefined && typeof failure.status === 'number'
                ? failure.status
                : undefined;
        return {
            code: error.code,
            message: error.message,
            ...status === undefined ? {} : { status },
            ...failure !== undefined && typeof failure.requestId === 'string' ? { requestId: failure.requestId } : {},
        };
    }
    return { code: 'TRANSPORT', message: error instanceof Error ? error.message : 'request failed' };
}
/** Read the account balance from the documented authenticated endpoint. */
export async function readBalance(options) {
    const endpoint = `${options.origin}/api/check-balance`;
    try {
        const response = await requestJson({
            url: endpoint,
            method: 'POST',
            headers: {
                ...accountHeaders(options.apiKey, options.attribution),
                'Content-Type': 'application/json',
            },
            body: '{}',
            timeoutMs: options.timeoutMs,
            maxBytes: 512 * 1024,
            ...options.fetch === undefined ? {} : { fetch: options.fetch },
            ...options.signal === undefined ? {} : { signal: options.signal },
        });
        const body = response.body;
        if (!isRecord(body)) {
            return { failure: { code: 'MALFORMED_RESPONSE', message: 'NanoGPT balance endpoint returned a non-object body', status: response.status } };
        }
        const usd = optionalNumeric(body.usd_balance) ??
            optionalNumeric(body.usdBalance) ??
            optionalNumeric(body.usd) ??
            optionalNumeric(nested(body, 'balance')?.usd);
        const xno = optionalNumeric(body.nano_balance) ??
            optionalNumeric(body.nanoBalance) ??
            optionalNumeric(body.xnoBalance) ??
            optionalNumeric(body.xno) ??
            optionalNumeric(nested(body, 'balance')?.xno);
        const generic = optionalNumeric(body.balance) ?? optionalNumeric(body.credit);
        const depositAddress = optionalString(body.nanoDepositAddress) ?? optionalString(body.nano_deposit_address);
        const unknownUnit = usd === undefined && xno === undefined && generic !== undefined;
        return {
            value: {
                ...usd === undefined ? {} : { usd },
                ...xno === undefined ? {} : { xno },
                ...depositAddress === undefined ? {} : { depositAddress },
                unknownUnit,
                fetchedAt: new Date().toISOString(),
                endpoint,
            },
        };
    }
    catch (error) {
        return { failure: failureOf(error) };
    }
}
/** Read aggregate usage for the authenticated API key. */
export async function readUsage(options) {
    const endpoint = usageQuery(options.baseURL, options.from, options.to);
    try {
        const response = await requestJson({
            url: endpoint,
            headers: accountHeaders(options.apiKey, options.attribution),
            timeoutMs: options.timeoutMs,
            maxBytes: 4 * 1024 * 1024,
            ...options.fetch === undefined ? {} : { fetch: options.fetch },
            ...options.signal === undefined ? {} : { signal: options.signal },
        });
        const body = response.body;
        if (!isRecord(body)) {
            return { failure: { code: 'MALFORMED_RESPONSE', message: 'NanoGPT usage endpoint returned a non-object body', status: response.status } };
        }
        const totals = isRecord(body.totals) ? body.totals : body;
        const byModel = Array.isArray(body.byModel)
            ? body.byModel.filter(isRecord).map((row) => ({
                model: optionalString(row.model) ?? 'unknown',
                ...optionalNumber(row.requests) === undefined ? {} : { requests: optionalNumber(row.requests) },
                ...optionalNumber(row.netCostUsd) === undefined ? {} : { netCostUsd: optionalNumber(row.netCostUsd) },
                ...optionalNumber(row.inputTokens) === undefined ? {} : { inputTokens: optionalNumber(row.inputTokens) },
                ...optionalNumber(row.outputTokens) === undefined ? {} : { outputTokens: optionalNumber(row.outputTokens) },
                ...optionalNumber(row.totalTokens) === undefined ? {} : { totalTokens: optionalNumber(row.totalTokens) },
            }))
            : undefined;
        return {
            value: {
                ...optionalString(body.from) === undefined ? {} : { from: optionalString(body.from) },
                ...optionalString(body.to) === undefined ? {} : { to: optionalString(body.to) },
                ...optionalNumber(totals.requests) === undefined ? {} : { requests: optionalNumber(totals.requests) },
                ...optionalNumber(totals.costUsd) === undefined ? {} : { costUsd: optionalNumber(totals.costUsd) },
                ...optionalNumber(totals.refundedUsd) === undefined ? {} : { refundedUsd: optionalNumber(totals.refundedUsd) },
                ...optionalNumber(totals.netCostUsd) === undefined ? {} : { netCostUsd: optionalNumber(totals.netCostUsd) },
                ...optionalNumber(totals.inputTokens) === undefined ? {} : { inputTokens: optionalNumber(totals.inputTokens) },
                ...optionalNumber(totals.outputTokens) === undefined ? {} : { outputTokens: optionalNumber(totals.outputTokens) },
                ...optionalNumber(totals.reasoningTokens) === undefined ? {} : { reasoningTokens: optionalNumber(totals.reasoningTokens) },
                ...optionalNumber(totals.totalTokens) === undefined ? {} : { totalTokens: optionalNumber(totals.totalTokens) },
                ...byModel === undefined ? {} : { byModel },
                fetchedAt: new Date().toISOString(),
            },
        };
    }
    catch (error) {
        return { failure: failureOf(error) };
    }
}
/** Read subscription quota and routing advice for the authenticated key. */
export async function readSubscription(options) {
    const endpoint = `${options.origin}/api/subscription/v1/usage`;
    try {
        const response = await requestJson({
            url: endpoint,
            headers: accountHeaders(options.apiKey, options.attribution),
            timeoutMs: options.timeoutMs,
            maxBytes: 1024 * 1024,
            ...options.fetch === undefined ? {} : { fetch: options.fetch },
            ...options.signal === undefined ? {} : { signal: options.signal },
        });
        const body = response.body;
        if (!isRecord(body)) {
            return { failure: { code: 'MALFORMED_RESPONSE', message: 'NanoGPT subscription endpoint returned a non-object body', status: response.status } };
        }
        const limits = isRecord(body.limits) ? body.limits : undefined;
        const quotas = [];
        const seenQuotaIds = new Set();
        /**
         * Documented subscription responses put quota windows at the top level
         * (`dailyInputTokens`, `weeklyInputTokens`, `dailyImages`, `tokens`) and
         * put their caps in the flat `limits` object. Older responses nested the
         * whole window under `limits`; both shapes are accepted here.
         */
        const addQuota = (id, value) => {
            if (seenQuotaIds.has(id) || !isRecord(value))
                return;
            const used = optionalNumeric(value.used);
            const remaining = optionalNumeric(value.remaining);
            const percentUsed = optionalNumeric(value.percentUsed);
            const resetAt = optionalNumeric(value.resetAt);
            const limit = optionalNumeric(value.limit) ??
                optionalNumeric(value.total) ??
                (limits === undefined ? undefined : optionalNumeric(limits[id]));
            if (used === undefined && remaining === undefined && limit === undefined && percentUsed === undefined)
                return;
            seenQuotaIds.add(id);
            quotas.push({
                id,
                ...used === undefined ? {} : { used },
                ...remaining === undefined ? {} : { remaining },
                ...limit === undefined ? {} : { limit },
                ...percentUsed === undefined ? {} : { percentUsed },
                ...resetAt === undefined ? {} : { resetAt },
                ...value.degraded === true ? { degraded: true } : {},
            });
        };
        for (const [id, value] of Object.entries(body)) {
            if (id === 'limits' || id === 'routing' || id === 'period' || id === 'subscription')
                continue;
            addQuota(id, value);
        }
        if (limits !== undefined) {
            for (const [id, value] of Object.entries(limits))
                addQuota(id, value);
        }
        const routing = isRecord(body.routing) ? body.routing : undefined;
        const period = isRecord(body.period) ? body.period : undefined;
        const periodEnd = optionalString(period?.currentPeriodEnd) ??
            optionalString(period?.end) ??
            optionalString(body.currentPeriodEnd);
        return {
            value: {
                ...typeof body.active === 'boolean' ? { active: body.active } : {},
                ...optionalString(body.state) === undefined ? {} : { state: optionalString(body.state) },
                ...optionalString(routing?.recommendedMode) === undefined ? {} : { recommendedMode: optionalString(routing?.recommendedMode) },
                ...optionalString(routing?.reason) === undefined ? {} : { rationale: optionalString(routing?.reason) },
                ...typeof body.subscriptionQuotaAvailable === 'boolean' || body.subscriptionQuotaAvailable === null
                    ? { subscriptionQuotaAvailable: body.subscriptionQuotaAvailable }
                    : routing !== undefined && (typeof routing.subscriptionQuotaAvailable === 'boolean' || routing.subscriptionQuotaAvailable === null)
                        ? { subscriptionQuotaAvailable: routing.subscriptionQuotaAvailable }
                        : {},
                ...quotas.length === 0 ? {} : { quotas },
                ...periodEnd === undefined ? {} : { periodEnd },
                fetchedAt: new Date().toISOString(),
            },
        };
    }
    catch (error) {
        return { failure: failureOf(error) };
    }
}
