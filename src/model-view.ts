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
import { mergeModelOverrides, effortDescription, effortName } from './catalog.js'
import {
  effectiveAdvanced,
  effectiveProtocol,
  effectiveRouting,
} from './protocols/common.js'
import type { ResolvedConfig } from './config.js'
import { preferenceOverrides, type Preferences } from './preferences.js'
import { resolveReasoning, type ReasoningPolicy } from './reasoning.js'
import type { CatalogModel, CatalogSnapshot, Protocol, WireEffort } from './shared.js'

/** One merged model plus the user/deployment state around it. */
export interface ModelViewRecord {
  model: CatalogModel
  /** Whether the user hid the model from the picker. */
  hidden: boolean
  /** Whether a deployment/user override retired the model. */
  disabled: boolean
  /** Favorite flag. */
  favorite: boolean
  /** Pinned flag. */
  pinned: boolean
  /** Resolved reasoning policy; undefined for non-reasoning models. */
  reasoning?: ReasoningPolicy
  /** Effective wire protocol. */
  protocol: Protocol
  /** Effective routing controls. */
  routing: ReturnType<typeof effectiveRouting>
  /** Effective advanced controls. */
  advanced: ReturnType<typeof effectiveAdvanced>
  /** User override, when one exists. */
  userPreference?: Preferences['models'][string]
  /** Deployment override, when one exists. */
  deploymentOverride?: ResolvedConfig['models'][number]
}

/** Merge and project every model for one configuration/preference generation. */
export function buildModelViews(
  config: ResolvedConfig,
  preferences: Preferences,
  snapshot: CatalogSnapshot | undefined,
): ModelViewRecord[] {
  const overrides = [...config.models, ...preferenceOverrides(preferences)]
  const merged = mergeModelOverrides(snapshot?.models ?? [], overrides)
  const hidden = new Set(preferences.hidden)
  const pinned = new Set(preferences.pinned)
  const favorites = new Set(preferences.favorites)
  return merged.map((model) => {
    const userPreference = preferences.models[model.id]
    const deploymentOverride = config.models.find((entry) => entry.id === model.id)
    const override =
      userPreference?.reasoningDisabled === true
        ? { disabled: true, source: 'user-config' as const }
        : userPreference?.reasoningEfforts !== undefined
          ? { efforts: userPreference.reasoningEfforts, source: 'user-config' as const }
          : deploymentOverride?.reasoningDisabled === true
            ? { disabled: true, source: 'user-config' as const }
            : deploymentOverride?.reasoningEfforts !== undefined
              ? { efforts: deploymentOverride.reasoningEfforts, source: 'user-config' as const }
              : undefined
    const configuredDefault = preferences.defaultReasoningEffort ?? config.defaultReasoningEffort
    const modelDefault = userPreference?.defaultEffort ?? deploymentOverride?.defaultEffort
    const reasoning = resolveReasoning({
      model,
      ...override === undefined ? {} : { override },
      ...configuredDefault === undefined ? {} : { configuredDefault },
      ...modelDefault === undefined ? {} : { modelDefault },
      experimental: config.experimentalEfforts || preferences.ui.experimental === true,
    })
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
    }
  })
}

/** Serialize one effort ladder for the UI. */
export function effortView(policy: ReasoningPolicy | undefined): {
  id: WireEffort
  name: string
  description: string
}[] {
  return (policy?.efforts ?? []).map((effort) => ({
    id: effort,
    name: effortName(effort),
    description: effortDescription(effort),
  }))
}
