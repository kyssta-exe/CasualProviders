/**
 * Names and shapes shared by the Host and browser halves.
 *
 * Both halves import this module; it must stay free of runtime dependencies
 * beyond what `catalog.ts` already needs.
 */

import type { Volatile } from '@deepseek-ai/cordis'

/**
 * Settings namespace of this plugin, which is its own Loader entry id — see
 * `cordis.patch.yml`, whose inserted row is named `casual-providers`.
 *
 * It is not merely conventional: in this harness a plugin's `Config` schema
 * *is* its settings namespace, keyed by that row id, and only fields declared
 * `.volatile()` are writable through `settings.mutate`. Renaming one without
 * the other turns every preference write into a refusal naming a namespace
 * nothing registered.
 */
export const CASUAL_PROVIDERS_NAMESPACE = 'casual-providers'

/** Settings namespace whose section *is* the pi-ai provider profile dict. */
export const PI_AI_NAMESPACE = 'llm-pi-ai'

/** Settings namespace holding the process-wide default model selection. */
export const DEFAULT_MODEL_NAMESPACE = 'agent-default-model'

/**
 * Host plugin configuration. Every field is `Volatile`, so every field is a
 * durable user preference rather than a deployment default — see `Config` in
 * `index.ts` for why that is the mechanism, not a stylistic choice.
 */
export interface QuickSetupSettings {
  /** Render the Quick Setup panel under the Models page's provider rows. */
  quickSetup: Volatile<boolean>
  /** Offer to point `agent-default-model` at the first provider added. */
  autoSelectDefault: Volatile<boolean>
  /** Route ids pinned to the top of the panel, in order. */
  pinned: Volatile<string[]>
  /** Route ids the user hid from the panel. */
  hidden: Volatile<string[]>
}

/** Plain (non-volatile) view of {@link QuickSetupSettings}, for the browser. */
export type ResolvedQuickSetupSettings = {
  [K in keyof QuickSetupSettings]: QuickSetupSettings[K] extends Volatile<infer T> ? T : never
}

/** Defaults the Host schema resolves when no layer names a field. */
export const QUICK_SETUP_DEFAULTS: ResolvedQuickSetupSettings = {
  quickSetup: true,
  autoSelectDefault: true,
  pinned: [],
  hidden: [],
}
