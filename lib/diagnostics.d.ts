/**
 * Bounded, secret-free request diagnostics.
 *
 * Entries carry routing and accounting facts only: no prompt text, no tool
 * arguments, no model output, and never a credential. The buffer is in-memory
 * and bounded so a long session cannot grow it without limit.
 *
 * @module dsh-nanogpt/diagnostics
 */
import type { RequestDiagnostic } from './shared.js';
/** Default number of retained entries. */
export declare const DEFAULT_DIAGNOSTIC_LIMIT = 50;
/** One ring buffer of safe request diagnostics. */
export declare class Diagnostics {
    private readonly entries;
    private readonly limit;
    /** @param limit - maximum retained entries. */
    constructor(limit?: number);
    /** Append one settled request. */
    record(entry: RequestDiagnostic): void;
    /** Snapshot newest first. */
    list(): RequestDiagnostic[];
    /** Drop every entry. */
    clear(): void;
    /** Retained entry count. */
    get size(): number;
}
