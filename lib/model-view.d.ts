import { effectiveAdvanced, effectiveRouting } from './protocols/common.js';
import type { ResolvedConfig } from './config.js';
import { type Preferences } from './preferences.js';
import { type ReasoningPolicy } from './reasoning.js';
import type { CatalogModel, CatalogSnapshot, Protocol, WireEffort } from './shared.js';
/** One merged model plus the user/deployment state around it. */
export interface ModelViewRecord {
    model: CatalogModel;
    /** Whether the user hid the model from the picker. */
    hidden: boolean;
    /** Whether a deployment/user override retired the model. */
    disabled: boolean;
    /** Favorite flag. */
    favorite: boolean;
    /** Pinned flag. */
    pinned: boolean;
    /** Resolved reasoning policy; undefined for non-reasoning models. */
    reasoning?: ReasoningPolicy;
    /** Effective wire protocol. */
    protocol: Protocol;
    /** Effective routing controls. */
    routing: ReturnType<typeof effectiveRouting>;
    /** Effective advanced controls. */
    advanced: ReturnType<typeof effectiveAdvanced>;
    /** User override, when one exists. */
    userPreference?: Preferences['models'][string];
    /** Deployment override, when one exists. */
    deploymentOverride?: ResolvedConfig['models'][number];
}
/** Merge and project every model for one configuration/preference generation. */
export declare function buildModelViews(config: ResolvedConfig, preferences: Preferences, snapshot: CatalogSnapshot | undefined): ModelViewRecord[];
/** Serialize one effort ladder for the UI. */
export declare function effortView(policy: ReasoningPolicy | undefined): {
    id: WireEffort;
    name: string;
    description: string;
}[];
