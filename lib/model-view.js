/**
 * Model browser projection.
 *
 * The adapter and the settings RPC both read the same merged catalog view:
 * API catalog first, deployment overrides second, user preferences last. The
 * projection also resolves the reasoning policy and the effective protocol,
 * routing, and advanced controls so the settings page can show what a request
 * will actually do without duplicating resolution rules.
 *
 * @module dsh-nanogpt/model-view
 */
import { mergeModelOverrides, effortDescription, effortName } from './catalog.js';
import { effectiveAdvanced, effectiveProtocol, effectiveRouting, } from './protocols/common.js';
import { preferenceOverrides } from './preferences.js';
import { resolveReasoning } from './reasoning.js';
/** Merge and project every model for one configuration/preference generation. */
export function buildModelViews(config, preferences, snapshot) {
    const overrides = [...config.models, ...preferenceOverrides(preferences)];
    const merged = mergeModelOverrides(snapshot?.models ?? [], overrides);
    const hidden = new Set(preferences.hidden);
    const pinned = new Set(preferences.pinned);
    const favorites = new Set(preferences.favorites);
    return merged.map((model) => {
        const userPreference = preferences.models[model.id];
        const deploymentOverride = config.models.find((entry) => entry.id === model.id);
        const override = userPreference?.reasoningDisabled === true
            ? { disabled: true, source: 'user-config' }
            : userPreference?.reasoningEfforts !== undefined
                ? { efforts: userPreference.reasoningEfforts, source: 'user-config' }
                : deploymentOverride?.reasoningDisabled === true
                    ? { disabled: true, source: 'user-config' }
                    : deploymentOverride?.reasoningEfforts !== undefined
                        ? { efforts: deploymentOverride.reasoningEfforts, source: 'user-config' }
                        : undefined;
        const configuredDefault = preferences.defaultReasoningEffort ?? config.defaultReasoningEffort;
        const modelDefault = userPreference?.defaultEffort ?? deploymentOverride?.defaultEffort;
        const reasoning = resolveReasoning({
            model,
            ...override === undefined ? {} : { override },
            ...configuredDefault === undefined ? {} : { configuredDefault },
            ...modelDefault === undefined ? {} : { modelDefault },
            experimental: config.experimentalEfforts || preferences.ui.experimental === true,
        });
        return {
            model,
            hidden: hidden.has(model.id),
            disabled: userPreference?.enabled === false || deploymentOverride?.enabled === false,
            favorite: favorites.has(model.id),
            pinned: pinned.has(model.id),
            ...reasoning === undefined ? {} : { reasoning },
            protocol: effectiveProtocol(config, preferences, model),
            routing: effectiveRouting(config, preferences, model),
            advanced: effectiveAdvanced(config, preferences, model),
            ...userPreference === undefined ? {} : { userPreference },
            ...deploymentOverride === undefined ? {} : { deploymentOverride },
        };
    });
}
/** Serialize one effort ladder for the UI. */
export function effortView(policy) {
    return (policy?.efforts ?? []).map((effort) => ({
        id: effort,
        name: effortName(effort),
        description: effortDescription(effort),
    }));
}
