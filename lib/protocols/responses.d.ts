import { type PreparedWireRequest, type ProtocolContext } from './common.js';
/**
 * Serialize one DSH request for `/responses`.
 * @param context - resolved model, reasoning, options, and request hooks.
 * @param baseHeaders - authentication/attribution headers.
 * @returns the exact wire request.
 */
export declare function prepareResponsesRequest(context: ProtocolContext, baseHeaders: Record<string, string>): Promise<PreparedWireRequest>;
