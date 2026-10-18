/**
 * OpenAI Responses request serialization.
 *
 * NanoGPT exposes `/v1/responses` for models that support the native
 * Responses transport. Requests are stateless (`store: false`) because the DSH
 * session log is the source of truth; completed output items are stored in the
 * adapter replay envelope so opaque reasoning can be replayed when the same
 * model continues the conversation.
 *
 * @module dsh-nanogpt/protocols/responses
 */
import { LlmError } from '@deepseek-ai/dsh-llm';
import { isRecord } from '../catalog.js';
import { protocolEndpoint } from '../config.js';
import { readReplay } from '../replay.js';
import { applyExtraBody, effectiveAdvanced, effectiveMaxTokens, effectiveProtocol, effectiveRouting, effectiveTemperature, effectiveTopP, imagePlaceholder, modelWithSuffixes, projectFile, projectImage, projectedMessages, reasoningFields, responsesTools, routingApplication, safeHistoricalArguments, textOfBlocks, webSearchModel, } from './common.js';
/** Extract the visible text of a stored reasoning output item. */
function reasoningItemText(item) {
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
/** One user input item. */
async function userItem(context, message) {
    const content = [];
    for (const block of message.content) {
        switch (block.type) {
            case 'text':
                if (block.text.length > 0)
                    content.push({ type: 'input_text', text: block.text });
                break;
            case 'image': {
                const image = await projectImage(context, block);
                if (image === undefined)
                    content.push({ type: 'input_text', text: imagePlaceholder(block) });
                else {
                    content.push({ type: 'input_text', text: image.handle });
                    content.push({ type: 'input_image', image_url: `data:${image.mediaType};base64,${image.data}` });
                }
                break;
            }
            case 'file':
                content.push({ type: 'input_text', text: projectFile(context, block.attachment) });
                break;
            default:
                break;
        }
    }
    if (content.length === 0)
        return undefined;
    return { type: 'message', role: 'user', content };
}
/** One function-call output item. */
function toolResultItem(message) {
    if (message.role !== 'tool')
        return undefined;
    const text = textOfBlocks(message.content);
    // Responses' function_call_output carries text. Preserve tool images/files
    // through the same deterministic placeholder the DSH contract uses for a
    // route that cannot carry them inline, instead of silently dropping them.
    const extra = message.content
        .filter((block) => block.type === 'image')
        .map((block) => imagePlaceholder(block));
    const output = [text, ...extra].filter((part) => part.length > 0).join('\n');
    return {
        type: 'function_call_output',
        call_id: message.toolCallId,
        output: output.length === 0 ? '(empty tool result)' : output,
    };
}
/** Build one assistant turn's items, preserving native reasoning when replayable. */
function assistantItems(context, message) {
    if (message.role !== 'assistant')
        return [];
    const items = [];
    const replay = readReplay(message, 'responses', context.model.id);
    const reasoningText = message.content
        .filter((block) => block.type === 'reasoning')
        .map((block) => block.text)
        .join('');
    if (reasoningText.length > 0 && replay?.outputItems !== undefined) {
        const match = replay.outputItems.filter(isRecord).find((item) => item.type === 'reasoning' && reasoningItemText(item) === reasoningText);
        if (match !== undefined)
            items.push(match);
    }
    const text = textOfBlocks(message.content);
    if (text.length > 0) {
        items.push({
            type: 'message',
            role: 'assistant',
            content: [{ type: 'output_text', text }],
        });
    }
    for (const block of message.content) {
        if (block.type !== 'tool-call')
            continue;
        items.push({
            type: 'function_call',
            call_id: block.id,
            name: block.name,
            arguments: safeHistoricalArguments(block.arguments),
        });
    }
    return items;
}
/**
 * Serialize one DSH request for `/responses`.
 * @param context - resolved model, reasoning, options, and request hooks.
 * @param baseHeaders - authentication/attribution headers.
 * @returns the exact wire request.
 */
export async function prepareResponsesRequest(context, baseHeaders) {
    const { config, model, options } = context;
    const advanced = effectiveAdvanced(config, context.preferences, model);
    const routing = effectiveRouting(config, context.preferences, model);
    const protocol = effectiveProtocol(config, context.preferences, model);
    if (protocol !== 'responses') {
        throw new LlmError(`model "${model.id}" is configured for protocol "${protocol}", not responses`, 'INTERNAL');
    }
    if (options.stop !== undefined && options.stop.length > 0) {
        throw new LlmError('NanoGPT Responses does not document stop sequences; use Chat Completions or remove the stop list', 'UNSUPPORTED_OPTION');
    }
    const reasoning = reasoningFields(context, 'responses');
    const routed = routingApplication(routing, model, config, 'responses');
    const search = webSearchModel(model.id, advanced);
    const wireModel = modelWithSuffixes(search.model, [
        ...routed.suffixes,
        ...search.suffix === undefined ? [] : [search.suffix],
    ]);
    const projected = projectedMessages(options);
    const instructions = [];
    if (options.system !== undefined && options.system.trim().length > 0)
        instructions.push(options.system);
    const input = [];
    for (const message of projected.messages) {
        if (message.role === 'system') {
            const text = textOfBlocks(message.content);
            if (text.length > 0)
                instructions.push(text);
            continue;
        }
        if (message.role === 'user') {
            const item = await userItem(context, message);
            if (item !== undefined)
                input.push(item);
            continue;
        }
        if (message.role === 'assistant') {
            input.push(...assistantItems(context, message));
            continue;
        }
        if (message.role === 'tool') {
            const item = toolResultItem(message);
            if (item !== undefined)
                input.push(item);
        }
    }
    if (input.length === 0) {
        throw new LlmError('NanoGPT Responses request has no serializable input items', 'INVALID_REQUEST');
    }
    const tools = model.toolCalling === false ? [] : projected.tools;
    const warnings = [...routed.warnings, ...search.warning === undefined ? [] : [search.warning]];
    if (model.toolCalling === false && projected.tools.length > 0) {
        warnings.push(`Model "${model.id}" is not advertised as tool-capable; tool declarations were omitted.`);
    }
    const maxTokens = effectiveMaxTokens(options, config, advanced);
    if (maxTokens !== undefined && maxTokens < 16) {
        throw new LlmError('NanoGPT Responses requires max_output_tokens >= 16', 'INVALID_REQUEST');
    }
    const temperature = effectiveTemperature(options, config, advanced);
    const topP = effectiveTopP(config, advanced);
    const reasoningActive = reasoning.wireEffort !== undefined && reasoning.wireEffort !== 'none';
    const reasoningCapable = context.policy !== undefined || model.reasoning === true;
    const suppressSampling = reasoningCapable && reasoning.wireEffort !== 'none';
    if (suppressSampling && (temperature !== undefined || topP !== undefined)) {
        warnings.push('NanoGPT Responses documents temperature/top_p as unsupported on reasoning-capable models; the values were omitted.');
    }
    const body = {
        model: wireModel,
        input,
        stream: true,
        store: false,
        ...instructions.length === 0 ? {} : { instructions: instructions.join('\n\n') },
        ...reasoning.fields,
        ...routed.body,
        ...maxTokens === undefined ? {} : { max_output_tokens: maxTokens },
        ...suppressSampling || temperature === undefined ? {} : { temperature },
        ...suppressSampling || topP === undefined ? {} : { top_p: topP },
        ...advanced.seed === undefined ? {} : { seed: advanced.seed },
        ...advanced.presencePenalty === undefined ? {} : { presence_penalty: advanced.presencePenalty },
        ...advanced.frequencyPenalty === undefined ? {} : { frequency_penalty: advanced.frequencyPenalty },
        ...responsesTools(tools) === undefined ? {} : { tools: responsesTools(tools) },
        ...reasoningActive ? { include: ['reasoning.encrypted_content'] } : {},
        ...options.sessionId === undefined ? {} : { prompt_cache_key: String(options.sessionId) },
        ...advanced.promptCaching?.enabled === true
            ? { prompt_cache_key: options.sessionId === undefined ? 'dsh-nanogpt' : String(options.sessionId) }
            : {},
        ...routing.billingMode === 'paygo' ? { billing_mode: 'paygo' } : {},
    };
    applyExtraBody(body, advanced);
    return {
        url: protocolEndpoint(config.baseURL, 'responses'),
        headers: { ...baseHeaders, 'Content-Type': 'application/json', ...routed.headers },
        body,
        protocol: 'responses',
        model: model.id,
        ...reasoning.wireEffort === undefined ? {} : { wireEffort: reasoning.wireEffort },
        excludeReasoning: reasoning.exclude,
        ...maxTokens === undefined ? {} : { maxTokens },
        ...routed.provider === undefined ? {} : { provider: routed.provider },
        warnings,
    };
}
