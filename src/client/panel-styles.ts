/**
 * Quick Setup styles, as an explicit injection module.
 *
 * Why this is not a `*.module.css` file: the dsh client module system is
 * Lazy-CJS, so every module-body side effect — style injection included — has
 * to live inside the bundle's factory closure and run at materialization. The
 * in-repo client preset does that with an unpublished build plugin that turns
 * a CSS-module import into a generated injecting module; a plugin built
 * out-of-repo cannot use that preset, and a plain `.css` import would instead
 * emit a separate stylesheet asset that nothing ever fetches.
 *
 * So the stylesheet lives here as a string and the class-name map is generated
 * from one list, which keeps the two halves from drifting the way a
 * hand-maintained map would. Every class is prefixed `cp-` because these rules
 * land in the shared document alongside every other plugin's, where an
 * unscoped `.title` or `.row` would collide.
 *
 * The injection is idempotent and keyed the way the client module system keys
 * its own: a `style[data-plugin-css]` selector, so re-running it is free and
 * two live instances cannot double-inject.
 */

/** Every class this plugin defines. The generated names prefix `cp-`. */
const CLASS_NAMES = [
  'panel',
  'head',
  'title',
  'intro',
  'notice',
  'group',
  'groupTitle',
  'rows',
  'row',
  'rowHead',
  'label',
  'routeId',
  'stateRow',
  'state',
  'badge',
  'blurb',
  'hint',
  'note',
  'error',
  'ok',
  'keyForm',
  'keyInput',
  'actions',
  'link',
  'cardExtras',
] as const

/** One class name this plugin defines. */
export type ClassName = (typeof CLASS_NAMES)[number]

/** The document-wide prefix every generated class carries. */
const PREFIX = 'cp'

/** `rowHead` becomes `cp-row-head`, matching the stylesheet below. */
function scoped(name: string): string {
  return `${PREFIX}-${name.replace(/[A-Z]/g, letter => `-${letter.toLowerCase()}`)}`
}

/**
 * The class-name map components read through. Built from {@link CLASS_NAMES}
 * so a new class is one list entry plus one stylesheet rule, not three edits.
 */
export const styles: Readonly<Record<ClassName, string>> = Object.freeze(
  Object.fromEntries(CLASS_NAMES.map(name => [name, scoped(name)])) as Record<ClassName, string>,
)

/**
 * The stylesheet. Every color resolves through a `--dsw-alias-*` token: a bare
 * color name would render the light-mode literal written as its fallback and
 * stay light under the dark theme, which is the mistake this comment exists to
 * prevent.
 */
const CSS = `
.${scoped('panel')} {
  display: flex; flex-direction: column; gap: 12px;
  max-width: 720px; margin-top: 24px; padding-top: 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-primary);
}
.${scoped('head')} { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.${scoped('title')} { margin: 0; font-size: 16px; line-height: 24px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.${scoped('intro')} { margin: 4px 0 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-tertiary); }
.${scoped('notice')} { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-warn-label); }
.${scoped('group')} { display: flex; flex-direction: column; gap: 8px; }
.${scoped('groupTitle')} {
  margin: 8px 0 0; font-size: 12px; line-height: 18px; font-weight: 500;
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--dsw-alias-label-tertiary);
}
.${scoped('rows')} { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.${scoped('row')} {
  border: 0.5px solid var(--dsw-alias-border-l4); border-radius: 16px; padding: 12px 14px;
  display: flex; flex-direction: column; gap: 6px;
}
.${scoped('rowHead')} { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.${scoped('label')} { font-size: 14px; line-height: 20px; font-weight: 500; color: var(--dsw-alias-label-primary); }
.${scoped('routeId')} {
  font-family: var(--ds-font-family-code); font-size: 11px; line-height: 16px; padding: 1px 5px;
  border-radius: var(--dsw-radius-xs); color: var(--dsw-alias-label-tertiary);
  border: 0.5px solid var(--dsw-alias-border-subtle);
}
.${scoped('stateRow')} { margin-left: auto; display: flex; align-items: center; gap: 6px; }
.${scoped('state')} { font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.${scoped('badge')} {
  font-size: 11px; line-height: 16px; padding: 1px 6px; border-radius: 999px;
  color: var(--dsw-alias-brand-primary); border: 0.5px solid var(--dsw-alias-border-l3);
}
.${scoped('blurb')} { margin: 0; font-size: 13px; line-height: 20px; color: var(--dsw-alias-label-secondary); }
.${scoped('hint')} { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-label-tertiary); }
.${scoped('note')} { margin: 0; font-size: 11px; line-height: 16px; color: var(--dsw-alias-label-tertiary); }
.${scoped('error')} { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-error-primary); }
.${scoped('ok')} { margin: 0; font-size: 12px; line-height: 18px; color: var(--dsw-alias-state-success-primary); }
.${scoped('keyForm')} { display: flex; align-items: center; gap: 8px; }
.${scoped('keyInput')} { flex: 1 1 auto; min-width: 0; }
.${scoped('actions')} { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.${scoped('link')} { font-size: 12px; line-height: 18px; color: var(--dsw-alias-brand-primary); text-decoration: none; }
.${scoped('link')}:hover { text-decoration: underline; }
.${scoped('cardExtras')} {
  display: flex; flex-direction: column; gap: 6px; padding-top: 10px; margin-top: 10px;
  border-top: 0.5px solid var(--dsw-alias-border-subtle);
}
`

/** The plugin identity the client module system records injected styles under. */
const PLUGIN = 'dsh-casual-providers'

/** The idempotency key for one stylesheet. */
const TAG_ID = `${PLUGIN}/quick-setup.css`

/**
 * Put the Quick Setup rules in the document once.
 *
 * Called from `apply()` rather than at module scope so the injection is part
 * of an effect the plugin owns and can be reasoned about, instead of a
 * top-level statement that fires whenever the bundle is materialized. The
 * guard matches the client module system's own bookkeeping attribute, so this
 * composes with its style eviction on plugin disable.
 */
export function injectPanelStyles(): void {
  if (typeof document === 'undefined') return
  if (document.querySelector(`style[data-plugin-css=${JSON.stringify(TAG_ID)}]`) !== null) return
  const tag = document.createElement('style')
  tag.dataset.plugin = PLUGIN
  tag.dataset.pluginCss = TAG_ID
  tag.textContent = CSS
  document.head.appendChild(tag)
}
