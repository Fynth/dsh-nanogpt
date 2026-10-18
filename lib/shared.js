/**
 * Shared host-side vocabulary for the NanoGPT provider.
 *
 * The wire effort vocabulary is NanoGPT's documented `reasoning_effort` set.
 * It is deliberately kept separate from DSH's adapter-owned effort identifiers:
 * DSH exposes whatever this adapter advertises, and this module is the single
 * place that maps a selection to the exact string NanoGPT accepts.
 *
 * @module dsh-nanogpt/shared
 */
/** Registered provider route. */
export const PROVIDER = 'nanogpt';
/** Plugin profile entry id; also the settings namespace advertised to DSH. */
export const PLUGIN_NAME = 'llm-nanogpt';
/** Human-readable provider name. */
export const DISPLAY_NAME = 'NanoGPT';
/** Default direct API host documented by NanoGPT. */
export const DEFAULT_BASE_URL = 'https://api.nano-gpt.com/api/v1';
/** Credential reference resolved when configuration names none. */
export const DEFAULT_API_KEY_ENV = 'NANOGPT_API_KEY';
/** Documented NanoGPT reasoning-effort vocabulary, in escalation order. */
export const WIRE_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'];
/** Wire protocols this adapter can speak. */
export const PROTOCOLS = ['chat', 'responses', 'messages'];
/** How reasoning content is rendered by NanoGPT's transport variants. */
export const VISIBILITIES = ['show', 'hide'];
/** Model-specific capability provenance, shown in the settings UI. */
export const CAPABILITY_SOURCES = [
    'api',
    'api-route',
    'documentation',
    'verified',
    'user-config',
    'inferred',
    'unknown',
];
