/**
 * Responses stream translation.
 *
 * The terminal `response.completed` object carries the authoritative usage and
 * the complete output-item list; incremental frames are normalized into DSH
 * blocks as they arrive, and the final output is used only to fill content the
 * endpoint did not stream. Completed output items are retained in replay state
 * so opaque reasoning can be replayed on the same model.
 *
 * @module dsh-nanogpt/stream/responses
 */
import { LlmError, ProviderRequestId } from '@deepseek-ai/dsh-llm';
import { isRecord, optionalNumber, optionalString } from '../catalog.js';
import { failureCodeFor, parseProviderError, reportedCost } from '../errors.js';
import { makeReplay } from '../replay.js';
import { responsesTokenUsage } from '../usage.js';
import { BlockStream } from './blocks.js';
import { isDoneEvent, parseJsonEvent, parseSse } from '../sse.js';
/** Read the text of one Responses message output item. */
function messageText(item) {
    const content = Array.isArray(item.content) ? item.content : [];
    const parts = [];
    for (const part of content) {
        if (isRecord(part) && part.type === 'output_text' && typeof part.text === 'string')
            parts.push(part.text);
        else if (isRecord(part) && part.type === 'refusal' && typeof part.refusal === 'string')
            parts.push(part.refusal);
    }
    return parts.join('');
}
/** Read the reasoning text of one Responses reasoning item. */
function reasoningText(item) {
    const content = Array.isArray(item.content) ? item.content : [];
    const parts = [];
    for (const part of content) {
        if (isRecord(part) && part.type === 'reasoning_text' && typeof part.text === 'string')
            parts.push(part.text);
    }
    if (parts.length > 0)
        return parts.join('');
    const summary = Array.isArray(item.summary) ? item.summary : [];
    for (const part of summary) {
        if (isRecord(part) && part.type === 'summary_text' && typeof part.text === 'string')
            parts.push(part.text);
    }
    return parts.join('');
}
/** Read a delta string from either `delta` or `text`. */
function deltaText(payload) {
    return typeof payload.delta === 'string' ? payload.delta : typeof payload.text === 'string' ? payload.text : '';
}
/** Classify one Responses stream failure. */
function failureOf(payload, options) {
    const errorObject = isRecord(payload.error) ? payload.error : undefined;
    const responseObject = isRecord(payload.response) ? payload.response : undefined;
    const responseError = isRecord(responseObject?.error) ? responseObject.error : undefined;
    const details = parseProviderError(errorObject ?? responseError ?? payload, optionalNumber(payload.status) ?? 503);
    const status = optionalNumber(errorObject?.status) ?? optionalNumber(payload.status) ?? 503;
    return new LlmError(`NanoGPT Responses stream for "${options.model.id}" failed${details.code === undefined ? '' : ` (${details.code})`}: ${details.message}`, failureCodeFor(status, details), {
        status,
        ...options.requestId === undefined ? {} : { requestId: ProviderRequestId(options.requestId) },
    });
}
/** Translate one Responses SSE body into DSH chunks. */
export async function* translateResponsesStream(body, options) {
    const blocks = new BlockStream();
    const tools = new Map();
    let responseId;
    let providerModel;
    let terminal;
    let finalResponse;
    let usage;
    let cost;
    let textEmitted = false;
    let reasoningEmitted = false;
    let toolEmitted = false;
    const collectedItems = [];
    const emitOutputFallback = (response) => {
        const chunks = [];
        const output = Array.isArray(response.output) ? response.output.filter(isRecord) : [];
        for (const item of output) {
            if (item.type === 'reasoning' && !reasoningEmitted) {
                const text = reasoningText(item);
                if (text.length > 0) {
                    chunks.push(...blocks.reasoning(`reasoning:${String(item.id ?? '0')}`, text));
                    reasoningEmitted = true;
                }
            }
            else if (item.type === 'message' && !textEmitted) {
                const text = messageText(item);
                if (text.length > 0) {
                    chunks.push(...blocks.text(`text:${String(item.id ?? '0')}`, text));
                    textEmitted = true;
                }
            }
            else if (item.type === 'function_call' && !toolEmitted) {
                const key = `tool:${String(item.call_id ?? item.id ?? '0')}`;
                const callId = optionalString(item.call_id) ?? optionalString(item.id) ?? key;
                const name = optionalString(item.name) ?? 'tool';
                const args = typeof item.arguments === 'string' ? item.arguments : '';
                chunks.push(...blocks.toolDelta(key, args, callId, name));
                toolEmitted = true;
            }
        }
        return chunks;
    };
    for await (const event of parseSse(body, {
        idleTimeoutMs: options.idleTimeoutMs,
        ...options.signal === undefined ? {} : { signal: options.signal },
    })) {
        if (isDoneEvent(event))
            break;
        const payload = parseJsonEvent(event, 'Responses');
        const type = optionalString(payload.type) ?? event.event ?? '';
        if (type === 'error')
            throw failureOf(payload, options);
        if (type === 'response.failed')
            throw failureOf(payload, options);
        if (type === 'response.created' || type === 'response.in_progress') {
            const response = isRecord(payload.response) ? payload.response : undefined;
            responseId = optionalString(response?.id) ?? responseId;
            providerModel = optionalString(response?.model) ?? providerModel;
            continue;
        }
        if (type === 'response.output_item.added') {
            const item = isRecord(payload.item) ? payload.item : undefined;
            if (item?.type === 'function_call') {
                const key = `tool:${String(item.call_id ?? item.id ?? payload.output_index ?? tools.size)}`;
                const callId = optionalString(item.call_id) ?? optionalString(item.id) ?? key;
                const name = optionalString(item.name) ?? 'tool';
                tools.set(String(payload.item_id ?? item.id ?? key), { key, id: callId, name, args: '' });
                for (const chunk of blocks.toolDelta(key, '', callId, name))
                    yield chunk;
                toolEmitted = true;
            }
            continue;
        }
        if (type === 'response.output_text.delta') {
            const text = deltaText(payload);
            if (text.length > 0) {
                for (const chunk of blocks.text(`text:${String(payload.item_id ?? payload.output_index ?? '0')}`, text))
                    yield chunk;
                textEmitted = true;
            }
            continue;
        }
        if (type === 'response.reasoning.delta' || type === 'response.reasoning_text.delta' || type === 'response.reasoning_summary_text.delta') {
            const text = deltaText(payload);
            if (text.length > 0) {
                for (const chunk of blocks.reasoning(`reasoning:${String(payload.item_id ?? payload.output_index ?? '0')}`, text))
                    yield chunk;
                reasoningEmitted = true;
            }
            continue;
        }
        if (type === 'response.function_call_arguments.delta') {
            const key = String(payload.item_id ?? payload.output_index ?? '');
            const tool = tools.get(key);
            const text = deltaText(payload);
            if (tool !== undefined && text.length > 0) {
                tool.args += text;
                for (const chunk of blocks.toolDelta(tool.key, text))
                    yield chunk;
            }
            continue;
        }
        if (type === 'response.output_item.done') {
            const item = isRecord(payload.item) ? payload.item : undefined;
            if (item !== undefined)
                collectedItems.push(item);
            if (item?.type === 'function_call') {
                const key = String(payload.item_id ?? item.id ?? '');
                const tool = tools.get(key) ?? {
                    key: `tool:${String(item.call_id ?? item.id ?? payload.output_index ?? tools.size)}`,
                    id: optionalString(item.call_id) ?? optionalString(item.id) ?? 'call',
                    name: optionalString(item.name) ?? 'tool',
                    args: '',
                };
                const fullArguments = typeof item.arguments === 'string' ? item.arguments : '';
                if (tool.args.length === 0 && fullArguments.length > 0) {
                    for (const chunk of blocks.toolDelta(tool.key, fullArguments))
                        yield chunk;
                    tool.args = fullArguments;
                }
                for (const chunk of blocks.close(tool.key))
                    yield chunk;
                toolEmitted = true;
            }
            continue;
        }
        if (type === 'response.completed' || type === 'response.incomplete') {
            terminal = type === 'response.completed' ? 'completed' : 'incomplete';
            finalResponse = isRecord(payload.response) ? payload.response : undefined;
            responseId = optionalString(finalResponse?.id) ?? responseId;
            providerModel = optionalString(finalResponse?.model) ?? providerModel;
            const reportedUsage = finalResponse?.usage;
            usage = responsesTokenUsage(reportedUsage) ?? usage;
            const reported = reportedCost(payload) ?? reportedCost(finalResponse);
            if (reported !== undefined)
                cost = reported;
            continue;
        }
        if (type === 'response.output_text.done') {
            if (!textEmitted) {
                const text = typeof payload.text === 'string' ? payload.text : '';
                if (text.length > 0) {
                    for (const chunk of blocks.text(`text:${String(payload.item_id ?? payload.output_index ?? '0')}`, text))
                        yield chunk;
                    textEmitted = true;
                }
            }
            continue;
        }
        if (type === 'response.reasoning.done') {
            if (!reasoningEmitted) {
                const text = deltaText(payload);
                if (text.length > 0) {
                    for (const chunk of blocks.reasoning(`reasoning:${String(payload.item_id ?? payload.output_index ?? '0')}`, text))
                        yield chunk;
                    reasoningEmitted = true;
                }
            }
            continue;
        }
    }
    if (terminal === undefined) {
        throw new LlmError(`NanoGPT Responses stream for "${options.model.id}" ended without a terminal response event`, 'STREAM_CLOSED');
    }
    if (finalResponse !== undefined) {
        for (const chunk of emitOutputFallback(finalResponse))
            yield chunk;
    }
    for (const chunk of blocks.closeAll())
        yield chunk;
    if (!blocks.hasBlocks) {
        throw new LlmError(`NanoGPT returned an empty response for "${options.model.id}"`, 'EMPTY_RESPONSE');
    }
    const hasToolCalls = blocks.replayBlocks().some((block) => block.type === 'tool-call');
    const reason = terminal === 'incomplete' ? 'max-tokens' : hasToolCalls ? 'tool-calls' : 'stop';
    const outputItems = Array.isArray(finalResponse?.output)
        ? finalResponse.output.filter(isRecord)
        : collectedItems;
    if (options.metrics !== undefined) {
        if (usage !== undefined)
            options.metrics.usage = usage;
        if (cost !== undefined)
            options.metrics.costUsd = cost;
    }
    if (usage !== undefined)
        yield { type: 'usage', usage };
    yield {
        type: 'finish',
        reason: { kind: reason },
        replayState: makeReplay({
            protocol: 'responses',
            model: options.model.id,
            ...responseId === undefined ? {} : { responseId },
            ...providerModel === undefined ? {} : { providerModel },
            blocks: blocks.replayBlocks(),
            outputItems,
        }),
    };
}
