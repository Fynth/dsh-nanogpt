/** Default number of retained entries. */
export const DEFAULT_DIAGNOSTIC_LIMIT = 50;
/** One ring buffer of safe request diagnostics. */
export class Diagnostics {
    entries = [];
    limit;
    /** @param limit - maximum retained entries. */
    constructor(limit = DEFAULT_DIAGNOSTIC_LIMIT) {
        this.limit = Math.max(1, Math.floor(limit));
    }
    /** Append one settled request. */
    record(entry) {
        this.entries.push(entry);
        while (this.entries.length > this.limit)
            this.entries.shift();
    }
    /** Snapshot newest first. */
    list() {
        return [...this.entries].reverse();
    }
    /** Drop every entry. */
    clear() {
        this.entries.length = 0;
    }
    /** Retained entry count. */
    get size() {
        return this.entries.length;
    }
}
