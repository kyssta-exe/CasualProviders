/**
 * Browser half of `dsh-casual-providers`: the two Models-page extension
 * seats.
 *
 * `settings.models.footer` receives the Quick Setup panel — the discovery
 * surface, a curated catalog of every major provider with its credential
 * reference and default model already resolved. `settings.models.provider-card`
 * receives the same capability keyed on `llm-pi-ai`, so it lands inside every
 * card of the pi-ai adapter family, including the dormant first-run setup
 * card, and configuring a provider never requires scrolling to the panel.
 *
 * Both seats render nothing when the Models page is closed, which is the point
 * of a slot rather than a new settings section: this plugin adds capability to
 * a page someone else owns and edits nothing there.
 *
 * Every provider write goes to the namespaces the pi-ai adapter and the
 * default-model service already own (`llm-pi-ai`, `agent-default-model`), which
 * is legal because the settings seam accepts any volatile field of any
 * addressed entry and validates the result against that entry's own `Config`.
 * A provider configured here and one configured on the built-in Models page are
 * the same profile, so the two surfaces mix freely.
 *
 * Export discipline mirrors `packages/client/AGENTS.md`: cross-feature
 * collaboration is type-only imports plus cordis services, never a value
 * import of another feature package.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
// Type-only: merges `ctx.locale`.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Type-only: merges the settings shell's SlotMap and the shared describe face.
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
// Type-only: declares `connection/reset`, whose payload this store resets on.
import type {} from '@deepseek-ai/dsh-client-connection/client'
// Type-only: merges the Models page's two child seats and their owner props.
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
// Type-only: merges the renderer shares the slot outlet injects.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
// Type-only: merges `ctx.remote` and its forwarded-event key face.
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import { QuickSetupPanel } from './QuickSetupPanel.tsx'
import type { QuickSetupInjected } from './QuickSetupPanel.tsx'
import { ProviderCardExtras } from './ProviderCardExtras.tsx'
import type { ProviderCardInjected } from './ProviderCardExtras.tsx'
import { QuickSetupStore } from './store.ts'
import { createCasualOperations } from './operations.ts'
import { injectPanelStyles } from './panel-styles.ts'
import { en, zh } from './locales.ts'
import type { QuickSetupKey } from './locales.ts'
import { PI_AI_NAMESPACE } from '../contract.ts'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Quick Setup panel and per-card extras copy. */
    'casual-providers': QuickSetupKey
  }
}

/** Dictionary namespace owned by this plugin. */
const NS = 'casual-providers'

/** Cordis plugin name used by loader diagnostics. */
export const name = NS

/**
 * The pure write helpers, re-exported for the offline tests — which run against
 * `lib/client.js` and cannot otherwise reach a component that the bundle keeps
 * private. Nothing in the browser imports these: a value import across a plugin
 * boundary would break the client's flat module graph, where only seed-table
 * words resolve.
 */
export {
  configureRoute,
  maybeAutoSelectDefault,
  normalizeApiKey,
  removeRoute,
  routeYaml,
  selectDefault,
} from './QuickSetupPanel.tsx'

/**
 * Required services. The two target seats are declared by
 * `dsh-client-ui-settings-models`' apply, whose activation order relative to
 * this one is not constrained — registration goes through `slots.inject()`,
 * which fires whenever the declaration lands.
 *
 * `configForms` is the settings domain's base service and the only one whose
 * name changed under this plugin's feet: it was `settingsScope` through
 * 0.1.x and is `ConfigForms` from 0.2.0. A service named in `inject` that
 * nothing provides is not a warning — the entry simply never activates, and the
 * web boot reports it as a pending fiber.
 */
export const inject = [
  'slots', 'locale', 'remote', 'remote.credentials', 'remote.llm', 'remote.settings',
  'configForms',
]

/**
 * Register both seats once the Models page declares them, and keep the joined
 * snapshot fresh on every pushed invalidation.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'casual-providers: copy dictionaries')
  // The rules must exist before the first card renders; the effect is idempotent,
  // so re-activation after an HMR reload costs one querySelector.
  ctx.effect(() => {
    injectPanelStyles()
    return () => {}
  }, 'casual-providers: panel styles')

  const operations = createCasualOperations(ctx)
  const store = new QuickSetupStore(operations, ctx.configForms.describe())
  const refresh = (): Promise<void> => store.load()

  // The `hooks.snapshot` seat carries the store HANDLE; the renderer binds it
  // as a React selector hook (`useSnapshot`), so the component reads a value
  // that re-renders on every replacement. Passing `getSnapshot()` here would
  // freeze the first answer and silently strand every later write. The
  // `locale` field on each registration supplies the component's `t` seat, so
  // the translate function never passes through here.
  const panel = (): QuickSetupInjected => ({
    operations,
    hooks: { snapshot: store.store },
    refresh,
  })
  const card = (): ProviderCardInjected => ({
    operations,
    hooks: { snapshot: store.store },
    refresh,
  })

  // Pushed invalidations converge an open panel without polling. The
  // `configForms` injection makes ui-settings activate first, and remote
  // dispatch preserves listener order, so this listener starts after the
  // mirror's own refresh and therefore reads a settled view. Both credential
  // events are watched: a provider route can be authorized either by a pasted
  // reference (a settings write) or by a completed OAuth sign-in (a record
  // write), and both change what a row can say about its key.
  ctx.effect(() => {
    const refreshIfLoaded = (): void => { store.refreshIfLoaded() }
    const disposers = [
      ctx.remote.$on('settings/document-updated', refreshIfLoaded),
      ctx.remote.$on('credentials/reference-updated', refreshIfLoaded),
      ctx.remote.$on('credentials/record-updated', refreshIfLoaded),
      ctx.remote.$on('llm/adapters-updated', refreshIfLoaded),
      ctx.on('connection/reset', () => {
        store.reset()
        refreshIfLoaded()
      }),
    ]
    return () => {
      for (const dispose of disposers) dispose()
    }
  }, 'casual-providers: pushed invalidations')

  ctx.slots.inject('settings.models.footer', () => ctx.slots.register({
    name: 'settings.models.footer',
    id: NS,
    order: 10,
    locale: NS,
    inject: panel,
  }, QuickSetupPanel))

  ctx.slots.inject('settings.models.provider-card', () => ctx.slots.register({
    name: 'settings.models.provider-card',
    key: PI_AI_NAMESPACE,
    locale: NS,
    inject: card,
  }, ProviderCardExtras))
}
