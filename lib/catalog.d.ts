import type { ResolvedModelOverride } from './config.js';
import { type CatalogModel, type CatalogSnapshot, type PricePerMillion, type WireEffort } from './shared.js';
/** Raw catalog record, intentionally loose because additive fields are expected. */
type RawRecord = Record<string, unknown>;
/** A normalized catalog model plus the non-DSH output modalities it disclosed. */
export interface NormalizedCatalogModel extends CatalogModel {
    /** Output modalities from `architecture.output_modalities`. */
    outputModalities?: readonly string[];
}
/** Narrow an unknown value to a plain record. */
export declare function isRecord(value: unknown): value is RawRecord;
/** Read one optional finite non-negative number. */
export declare function optionalNumber(value: unknown): number | undefined;
/**
 * Read one optional finite non-negative number from a number or a numeric
 * string. NanoGPT's account endpoints document string balances ("1.234") and
 * quota caps in both shapes, so parsing must accept both instead of showing a
 * missing balance.
 */
export declare function optionalNumeric(value: unknown): number | undefined;
/** Read one optional positive integer. */
export declare function optionalPositiveInteger(value: unknown): number | undefined;
/** Read one optional boolean. */
export declare function optionalBoolean(value: unknown): boolean | undefined;
/** Read one optional non-empty string. */
export declare function optionalString(value: unknown): string | undefined;
/** Strip control characters and bound a catalog description for safe text rendering. */
export declare function sanitizeText(value: unknown, limit?: number): string | undefined;
/**
 * Validate and order the reasoning values an endpoint advertised.
 * Unknown future values are dropped rather than treated as supported.
 * @param values - raw `reasoning_efforts` list.
 * @returns known efforts in escalation order, or undefined when the field was absent.
 */
export declare function normalizeEfforts(values: unknown): readonly WireEffort[] | undefined;
/** Normalize the two pricing shapes NanoGPT returns. */
export declare function normalizePricing(raw: RawRecord): {
    pricing?: PricePerMillion;
    source?: string;
    currency?: string;
};
/** Normalize one raw model record; returns undefined only when the record has no id. */
export declare function normalizeModel(raw: RawRecord, fetchedAt: string): NormalizedCatalogModel | undefined;
/** Whether a catalog record describes a text-output chat model DSH can select. */
export declare function isChatModel(model: NormalizedCatalogModel): boolean;
/** Stable hash of the normalized facts used for change detection. */
export declare function catalogHash(models: readonly CatalogModel[]): string;
/** Normalize one detailed `/models` answer. */
export declare function normalizeCatalogResponse(body: unknown, endpoint: string, fetchedAt: string): {
    snapshot: CatalogSnapshot;
    models: readonly NormalizedCatalogModel[];
};
/** Merge one deployment override over a catalog record, or create a declared model. */
export declare function applyModelOverride(base: CatalogModel | undefined, override: ResolvedModelOverride, verifiedAt?: string): CatalogModel;
/** Build the merged model list: catalog order, then hand-declared models appended. */
export declare function mergeModelOverrides(catalog: readonly CatalogModel[], overrides: readonly ResolvedModelOverride[]): CatalogModel[];
/** Find one model by exact id, then by a documented alias. */
export declare function findModel(models: readonly CatalogModel[], id: string): CatalogModel | undefined;
/** Human-readable effort name used by DSH selectors and the settings page. */
export declare function effortName(effort: WireEffort): string;
/** Short, honest description of what each effort means on NanoGPT. */
export declare function effortDescription(effort: WireEffort): string;
export {};
