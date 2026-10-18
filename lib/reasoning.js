/**
 * Reasoning capability resolution and wire mapping.
 *
 * The resolver answers one question per exact model: which NanoGPT effort
 * values are actually selectable, what the default is, whether reasoning can
 * be disabled, and where that fact came from. It never turns a generic
 * `capabilities.reasoning: true` into seven selectable levels. The wire mapper
 * is the only place a selected level becomes `reasoning_effort`,
 * `reasoning.effort`, `output_config.effort`, or `thinking.type: disabled`.
 *
 * @module dsh-nanogpt/reasoning
 */
import { WIRE_EFFORTS, } from './shared.js';
/**
 * Model-specific facts taken from NanoGPT's own documentation. These are used
 * only when `/models?detailed=true` does not advertise a `reasoning_efforts`
 * ladder; an API answer always wins. Each entry names the documented fact.
 */
const DOCUMENTED_POLICIES = {
    'anthropic/claude-opus-5.5': {
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        defaultEffort: 'high',
        alwaysThinking: true,
        note: 'Adaptive thinking; NanoGPT documents low/medium/high/xhigh/max, default high, and rejects none. Forced tool choice is unsupported.',
    },
    'anthropic/claude-fable-5.1': {
        efforts: ['low', 'medium', 'high', 'xhigh', 'max'],
        alwaysThinking: true,
        note: 'Inline-effort documentation lists low/medium/high/xhigh/max; minimal maps to low and none is rejected.',
    },
    'openai/gpt-6-astra': {
        efforts: ['low', 'medium', 'high', 'xhigh'],
        note: 'Inline-effort documentation lists low/medium/high/xhigh for this model.',
    },
};
/** Deduplicate and order a candidate effort list. */
function orderedEfforts(values) {
    const set = new Set(values);
    return WIRE_EFFORTS.filter((effort) => set.has(effort));
}
/** Compare two effort lists for equality. */
function sameEfforts(a, b) {
    if (a === undefined || b === undefined)
        return a === b;
    return a.length === b.length && a.every((value, index) => value === b[index]);
}
/**
 * Resolve one model's reasoning capability.
 *
 * Priority follows the specification: explicit provider-route facts, then the
 * API catalog ladder, then model-specific official documentation, then an
 * explicit user/deployment override, then a clearly marked inference. An
 * override that widens the ladder keeps both facts visible: the offered levels
 * are the override's, and every level the catalog did not confirm is listed in
 * `unverifiedLevels`.
 *
 * @param input - exact model, optional route, override, and defaults.
 * @returns the policy, or undefined for a model with no reasoning control.
 */
export function resolveReasoning(input) {
    const { model, route, override } = input;
    if (override?.disabled === true)
        return undefined;
    const notes = [];
    const apiLevels = model.reasoningEfforts === undefined ? undefined : orderedEfforts(model.reasoningEfforts);
    const documented = DOCUMENTED_POLICIES[model.id];
    let efforts = [];
    let source = 'unknown';
    let unknown = false;
    let inferred = false;
    if (route?.efforts !== undefined) {
        efforts = orderedEfforts(route.efforts);
        source = 'api-route';
        if (apiLevels !== undefined && !sameEfforts(efforts, apiLevels)) {
            notes.push(`Provider ${route.provider} advertises a ${efforts.length > 0 ? efforts.join('/') : 'default-only'} ladder that differs from the model-wide catalog.`);
        }
    }
    else if (override?.efforts !== undefined) {
        efforts = orderedEfforts(override.efforts);
        source = override.source ?? 'user-config';
        if (apiLevels !== undefined && !sameEfforts(efforts, apiLevels)) {
            notes.push(`User override differs from the catalog ladder (${apiLevels.length > 0 ? apiLevels.join('/') : 'none disclosed'}); values outside it are marked unverified.`);
        }
    }
    else if (apiLevels !== undefined && apiLevels.length > 0) {
        efforts = [...apiLevels];
        source = 'api';
    }
    else if (documented !== undefined) {
        efforts = [...documented.efforts];
        source = 'documentation';
        notes.push(documented.note);
    }
    else if (model.reasoning === true) {
        efforts = [];
        source = 'unknown';
        unknown = true;
        notes.push('The catalog says this model reasons but does not advertise its effort ladder; only the provider default can be selected.');
    }
    else if (model.reasoning === false) {
        return undefined;
    }
    else if (override === undefined) {
        return undefined;
    }
    if (route?.alwaysThinking === true && efforts.includes('none')) {
        efforts = efforts.filter((effort) => effort !== 'none');
        notes.push(`Provider ${route.provider} reports that reasoning cannot be disabled; none was removed.`);
    }
    if (input.experimental === true && efforts.length === 0) {
        efforts = [...WIRE_EFFORTS];
        source = 'inferred';
        inferred = true;
        unknown = false;
        notes.push('Experimental mode advertises all seven values even though the ladder is not disclosed; unsupported values fail at the provider.');
    }
    if (efforts.length === 0 && !unknown)
        return undefined;
    const apiEffortSet = new Set(apiLevels ?? []);
    const unverifiedLevels = inferred ? [...efforts] : efforts.filter((effort) => !apiEffortSet.has(effort));
    const alwaysThinking = route?.alwaysThinking === true ||
        (model.reasoning === true && !efforts.includes('none')) ||
        (documented?.alwaysThinking === true && !efforts.includes('none'));
    const supportsDisable = efforts.includes('none') && !alwaysThinking;
    let defaultEffort;
    const candidates = [
        { effort: input.modelDefault, label: 'model preference' },
        { effort: input.configuredDefault, label: 'profile default' },
        { effort: documented?.defaultEffort, label: 'documented model default' },
    ];
    for (const candidate of candidates) {
        if (candidate.effort === undefined || candidate.effort === 'auto')
            continue;
        if (efforts.includes(candidate.effort)) {
            defaultEffort = candidate.effort;
            break;
        }
        notes.push(`The ${candidate.label} "${candidate.effort}" is not offered by this model and was ignored (provider default stays in effect).`);
    }
    return {
        efforts,
        ...defaultEffort === undefined ? {} : { defaultEffort },
        source,
        alwaysThinking,
        supportsDisable,
        unknown,
        experimental: inferred || unverifiedLevels.length > 0,
        unverifiedLevels,
        notes,
        ...model.verifiedAt === undefined ? {} : { verifiedAt: model.verifiedAt },
        ...route === undefined ? {} : { route: route.provider },
    };
}
/** Failure raised before HTTP when a selection is not legal for the exact model. */
export class UnsupportedEffortError extends Error {
    /** Stable failure code. */
    code = 'UNSUPPORTED_REASONING_EFFORT';
    /** @param message - actionable explanation. */
    constructor(message) {
        super(message);
        this.name = 'UnsupportedEffortError';
    }
}
/**
 * Documented per-model effort aliases for request-level controls. Only
 * mappings with an explicit NanoGPT statement belong here; everything else is
 * sent exactly as advertised.
 */
const EFFORT_ALIASES = {
    'anthropic/claude-fable-5.1': { minimal: 'low' },
};
/**
 * Map an adapter selection to a wire value.
 * `auto`/undefined stay undefined (omit the field); `off` is an explicit
 * compatibility alias for `none`, never a wire spelling of its own.
 */
export function normalizeEffortSelection(selection, policy, modelId) {
    if (selection === undefined || selection === 'auto')
        return undefined;
    let requested = selection === 'off' ? 'none' : selection;
    if (policy === undefined) {
        throw new UnsupportedEffortError(`model "${modelId}" does not support reasoning effort "${selection}"`);
    }
    const alias = EFFORT_ALIASES[modelId]?.[requested];
    if (alias !== undefined && policy.efforts.includes(alias))
        requested = alias;
    if (!policy.efforts.includes(requested)) {
        if (requested === 'none' && policy.alwaysThinking) {
            throw new UnsupportedEffortError(`reasoning cannot be disabled for "${modelId}": this model always reasons. Choose another level or the provider default.`);
        }
        if (requested === 'none' && !policy.efforts.includes('none')) {
            throw new UnsupportedEffortError(`reasoning cannot be disabled for "${modelId}": the model does not advertise "none". Choose another level or the provider default.`);
        }
        throw new UnsupportedEffortError(`model "${modelId}" does not support reasoning effort "${requested}"; offered: ${policy.efforts.join(', ') || 'provider default only'}`);
    }
    return requested;
}
/**
 * Build the protocol-specific reasoning fields for one request.
 * @param protocol - wire protocol selected for this request.
 * @param selection - DSH selection, including the legacy `off` alias.
 * @param policy - resolved model policy.
 * @param visibility - output visibility setting.
 * @param modelId - exact model id for diagnostics.
 * @returns fields to merge and the actual effort sent.
 */
export function wireReasoning(protocol, selection, policy, visibility, modelId) {
    const effort = normalizeEffortSelection(selection, policy, modelId);
    const exclude = visibility === 'hide';
    if (protocol === 'chat') {
        // Chat Completions documents reasoning.exclude for output visibility.
        const fields = {
            ...effort === undefined ? {} : { reasoning_effort: effort },
            ...exclude ? { reasoning: { exclude: true } } : {},
        };
        return { ...effort === undefined ? {} : { wireEffort: effort }, exclude, fields };
    }
    if (protocol === 'responses') {
        // Responses documents both reasoning.effort and reasoning.exclude.
        const fields = {
            ...effort === undefined && !exclude
                ? {}
                : {
                    reasoning: {
                        ...effort === undefined ? {} : { effort },
                        ...exclude ? { exclude: true } : {},
                    },
                },
        };
        return { ...effort === undefined ? {} : { wireEffort: effort }, exclude, fields };
    }
    // Anthropic Messages documents output_config.effort (or thinking disabled
    // for none). NanoGPT does not document a hide-only control on this
    // transport, so visibility=hide is not serialized here; the Messages
    // serializer warns instead of inventing a suffix or body field.
    const fields = effort === 'none'
        ? { thinking: { type: 'disabled' } }
        : effort === undefined
            ? {}
            : { output_config: { effort } };
    return { ...effort === undefined ? {} : { wireEffort: effort }, exclude: false, fields };
}
/** Human-readable label for a resolved source. */
export function capabilitySourceLabel(source) {
    switch (source) {
        case 'api':
            return 'NanoGPT model catalog';
        case 'api-route':
            return 'NanoGPT provider discovery';
        case 'documentation':
            return 'NanoGPT documentation';
        case 'verified':
            return 'Plugin verification record';
        case 'user-config':
            return 'User override';
        case 'inferred':
            return 'Inferred (experimental)';
        case 'unknown':
            return 'Unknown';
    }
}
