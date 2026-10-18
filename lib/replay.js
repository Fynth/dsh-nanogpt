import { isRecord, optionalString } from './catalog.js';
/** Build one replay envelope. */
export function makeReplay(input) {
    return { response: { v: 1, ...input } };
}
/** Read the envelope from one durable assistant message. */
export function readReplay(message, protocol, model) {
    if (message.role !== 'assistant')
        return undefined;
    const raw = message.source.replayState;
    if (raw === undefined)
        return undefined;
    const response = isRecord(raw) && isRecord(raw.response) ? raw.response : undefined;
    if (response === undefined || response.v !== 1)
        return undefined;
    if (response.protocol !== protocol)
        return undefined;
    const storedModel = optionalString(response.model);
    if (storedModel !== model)
        return undefined;
    const blocks = [];
    if (Array.isArray(response.blocks)) {
        for (const block of response.blocks) {
            if (!isRecord(block))
                continue;
            const type = block.type;
            if (type !== 'text' && type !== 'reasoning' && type !== 'tool-call')
                continue;
            blocks.push({
                type,
                ...optionalString(block.signature) === undefined ? {} : { signature: optionalString(block.signature) },
                ...optionalString(block.id) === undefined ? {} : { id: optionalString(block.id) },
            });
        }
    }
    const outputItems = Array.isArray(response.outputItems) ? response.outputItems : undefined;
    return {
        v: 1,
        protocol,
        model,
        ...optionalString(response.responseId) === undefined ? {} : { responseId: optionalString(response.responseId) },
        ...optionalString(response.nativeStopReason) === undefined
            ? {}
            : { nativeStopReason: optionalString(response.nativeStopReason) },
        ...optionalString(response.providerModel) === undefined
            ? {}
            : { providerModel: optionalString(response.providerModel) },
        blocks,
        ...outputItems === undefined ? {} : { outputItems },
    };
}
/** Read one block's native metadata by emitted block index. */
export function replayBlock(replay, index) {
    return replay?.blocks[index];
}
