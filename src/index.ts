/**
 * Host loader entry for `dsh-casual-providers`.
 *
 * The plugin's substance is browser-side — a Quick Setup panel on the Models
 * settings page — so this half exists for two Host-side reasons:
 *
 * 1. The Loader needs a Node module at this row, so one package can ship a
 *    Host half and a browser half instead of two packages.
 * 2. It owns the plugin's configuration. A plugin's `Config` schema *is* its
 *    settings namespace, keyed by the profile row id this bundle inserts
 *    (`casual-providers`, see `cordis.patch.yml`), so the preferences the
 *    browser half reads back through the settings mirror are declared here.
 *
 * Nothing here writes provider configuration. A Host plugin that silently
 * seeded routes into another plugin's namespace would be surprising and hard
 * to undo; this one declares its own surface and gets out of the way.
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: merges the `ctx.settings` provider onto the Cordis Context.
import type {} from '@deepseek-ai/dsh-settings'
import z from '@deepseek-ai/schemastery'
import type { QuickSetupSettings } from './contract.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'casual-providers'

/**
 * No service is required to mount: the schema below is the whole Host story,
 * and the optional `settings` child is deliberately not in `inject` — a
 * deployment without Settings still gets this plugin.
 */
export const inject: string[] = []

export type Config = QuickSetupSettings

/**
 * Schemastery validation for {@link Config}.
 *
 * `.volatile()` is what makes a field form-editable. Only volatile fields of
 * an active, uniquely addressed profile entry may be written through
 * `settings.mutate`, so every field here is a durable user preference that
 * persists into the active profile's Cordis patch — not a deployment default
 * a user can talk back. The browser half reads the resolved section back
 * through the shared settings mirror.
 */
export const Config = z.object({
  /** Render the Quick Setup panel under the Models page's provider rows. */
  quickSetup: z.boolean().default(true).volatile(),
  /** Offer to point `agent-default-model` at the first provider added. */
  autoSelectDefault: z.boolean().default(true).volatile(),
  /** Route ids pinned to the top of the panel, in order. */
  pinned: z.array(z.string()).default([]).volatile(),
  /** Route ids the user hid from the panel. */
  hidden: z.array(z.string()).default([]).volatile(),
})

/**
 * Opt this entry out of an auto-generated settings page, because its browser
 * half owns the surface it would generate for.
 *
 * The policy is registered as an effect inside an optional
 * `ctx.inject(['settings'], …)` child: that is what lets a late-loading or
 * replaced Settings service pick it up, and what lets this plugin run without
 * Settings at all. The policy suppresses the automatic page only — it removes
 * neither configuration reads nor configuration writes.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  ctx.inject(['settings'], (settingsCtx) => {
    settingsCtx.effect(() => settingsCtx.settings.configure({ auto: false }, ctx.fiber))
  })
}
