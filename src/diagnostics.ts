/**
 * Bounded, secret-free request diagnostics.
 *
 * Entries carry routing and accounting facts only: no prompt text, no tool
 * arguments, no model output, and never a credential. The buffer is in-memory
 * and bounded so a long session cannot grow it without limit.
 *
 * @module dsh-nanogpt/diagnostics
 */
import type { RequestDiagnostic } from './shared.js'

/** Default number of retained entries. */
export const DEFAULT_DIAGNOSTIC_LIMIT = 50

/** One ring buffer of safe request diagnostics. */
export class Diagnostics {
  private readonly entries: RequestDiagnostic[] = []
  private readonly limit: number

  /** @param limit - maximum retained entries. */
  constructor(limit = DEFAULT_DIAGNOSTIC_LIMIT) {
    this.limit = Math.max(1, Math.floor(limit))
  }

  /** Append one settled request. */
  record(entry: RequestDiagnostic): void {
    this.entries.push(entry)
    while (this.entries.length > this.limit) this.entries.shift()
  }

  /** Snapshot newest first. */
  list(): RequestDiagnostic[] {
    return [...this.entries].reverse()
  }

  /** Drop every entry. */
  clear(): void {
    this.entries.length = 0
  }

  /** Retained entry count. */
  get size(): number {
    return this.entries.length
  }
}
