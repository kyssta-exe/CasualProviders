/**
 * Quick Setup: the panel this plugin contributes to the Models settings page's
 * `settings.models.footer` slot.
 *
 * The built-in Models page is authoritative but generic — every row is the
 * same card, and a first-time user has to know that a route id exists, that
 * its endpoint and model list come from a catalog, and that a key belongs
 * under a credential reference. This panel answers those questions with a
 * curated list: one card per provider worth knowing about, the endpoint and
 * models already resolved, and a single key field per row.
 *
 * Everything here writes through {@link CasualOperations}, which is the same
 * wire the built-in page uses — `settings.mutate` against the `llm-pi-ai` and
 * `agent-default-model` sections, and `credentials.set` for the secret. A
 * provider configured from either surface is the same profile, so the two can
 * be mixed freely.
 */

import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button, Input, StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRuntime, SlotInjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import type { QuickSetupKey } from './locales.ts'
import { groupKey } from './locales.ts'
import type { CasualOperations } from './operations.ts'
import type { QuickSetupRow, QuickSetupState } from './store.ts'
import type { CasualGroup } from '../catalog.ts'
import { CASUAL_GROUP_ORDER, deriveKeyRef } from '../catalog.ts'
import { CASUAL_PROVIDERS_NAMESPACE, DEFAULT_MODEL_NAMESPACE, PI_AI_NAMESPACE } from '../contract.ts'
import { styles } from './panel-styles.ts'

/**
 * Registration-side business face for the footer panel.
 *
 * The `hooks` compartment is reserved: the renderer binds `hooks.snapshot` to a
 * React selector hook (`useSnapshot`) and re-renders the panel on every store
 * replacement. A plain member would arrive once, at registration, and freeze.
 */
export interface QuickSetupInjected {
  /** Panel operations bound to this plugin's Remote namespaces. */
  operations: CasualOperations
  /** The joined snapshot seat, bound by the renderer as `useSnapshot`. */
  hooks: { snapshot: SnapshotStore<QuickSetupState> }
  /** Reload the joined snapshot after a write. */
  refresh: () => Promise<void>
}

/**
 * Props the slot outlet delivers: the framework's runtime share for this slot,
 * the declared locale seat, and the registrant's injected share with its
 * `hooks` compartment bound.
 */
export type QuickSetupProps =
  & PropsRuntime<'settings.models.footer'>
  & PropsLocale<'casual-providers'>
  & SlotInjectFace<QuickSetupInjected>

/** The bound translate seat this component reads copy through. */
type Translate = QuickSetupProps['t']

/** One row's transient UI state, kept out of the shared snapshot. */
interface RowDraft {
  keyValue: string
  busy: boolean
  message?: { tone: 'ok' | 'error'; text: string }
}

/** A fresh draft for one row. */
function freshDraft(): RowDraft {
  return { keyValue: '', busy: false }
}

/** Outcome of judging a typed key. */
export type KeyCheck = { ok: true; key: string } | { ok: false; reason: 'empty' | 'format' }

/**
 * Judge a typed API key on its own field, the same rule the built-in Models
 * page applies: after trimming it must be non-empty and every character must
 * be printable ASCII, which is exactly what an HTTP header value can carry.
 * A value pasted as a `NAME=value` environment line fails the same rule,
 * because its characters never could travel in a header.
 * @param raw - what the user typed.
 * @returns the literal to store, or why it was refused.
 */
export function normalizeApiKey(raw: string): KeyCheck {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return { ok: false, reason: 'empty' }
  if (!/^[\x21-\x7E]+$/.test(trimmed)) return { ok: false, reason: 'format' }
  return { ok: true, key: trimmed }
}

/**
 * The credential reference a row's key belongs under: the one its resolved
 * profile already names, else the conventional derived name.
 * @param row - the row being written.
 * @returns the reference name.
 */
export function rowKeyRef(row: QuickSetupRow): string {
  return row.keyRef ?? deriveKeyRef(row.provider.id)
}

/**
 * Configure one route, then store its secret when one was typed.
 *
 * The order matters. A settings commit validates the merged provider profile,
 * so a route that cannot resolve is refused before any secret is written; and
 * a failed credential stage after a committed settings stage leaves a keyless
 * but configured route, which is exactly the posture `signin` and `ambient`
 * routes want anyway. Storing the secret first would leave an orphan
 * credential behind on the far more common failure.
 *
 * A typed key names the reference explicitly — `apiKeyEnv` is a credential
 * *reference*, never a key value, so `settings.yaml` still carries no secret.
 * A keyless route names no reference at all, which is what tells the adapter
 * to defer to pi-ai's own provider-native discovery.
 * @param operations - the panel's Host operations.
 * @param row - the row to configure.
 * @param key - the typed key, or undefined for a keyless auth route.
 * @returns the failure message, or undefined once both stages landed.
 */
export async function configureRoute(
  operations: CasualOperations,
  row: QuickSetupRow,
  key: string | undefined,
): Promise<string | undefined> {
  const ref = rowKeyRef(row)
  const ops = key === undefined
    ? [{ op: 'set' as const, path: ['providers', row.provider.id], value: {} }]
    : [{ op: 'set' as const, path: ['providers', row.provider.id, 'apiKeyEnv'], value: ref }]
  const outcome = await operations.writeSettings(PI_AI_NAMESPACE, ops, undefined)
  if (outcome.kind !== 'written') return outcome.message
  if (key === undefined) return undefined
  return operations.storeCredential(ref, key)
}

/**
 * Remove one user-added route and the credential this panel owns.
 *
 * Credential removal comes first so a second-step failure leaves the route
 * visible and the whole operation retryable; both unsets are idempotent. The
 * credential is only removed when the profile names the exact derived
 * reference this panel would have written — a row whose profile carries a
 * hand-written reference is not provably ours, so its secret is retained.
 * @param operations - the panel's Host operations.
 * @param row - the row to remove.
 * @returns the failure message, or undefined once both stages landed.
 */
export async function removeRoute(
  operations: CasualOperations,
  row: QuickSetupRow,
): Promise<string | undefined> {
  if (row.keyRef === deriveKeyRef(row.provider.id)) {
    const credential = await operations.removeCredential(row.keyRef)
    if (credential !== undefined) return credential
  }
  const outcome = await operations.writeSettings(
    PI_AI_NAMESPACE,
    [{ op: 'unset', path: ['providers', row.provider.id] }],
    undefined,
  )
  return outcome.kind === 'written' ? undefined : outcome.message
}

/**
 * Point the process default at one route, using the model this catalog
 * suggests for it.
 * @param operations - the panel's Host operations.
 * @param row - the row to select.
 * @returns the failure message, `'no-model'`, or undefined once it landed.
 */
export async function selectDefault(
  operations: CasualOperations,
  row: QuickSetupRow,
): Promise<string | undefined> {
  const model = row.provider.suggestedModel
  if (model === undefined) return 'no-model'
  const outcome = await operations.writeSettings(
    DEFAULT_MODEL_NAMESPACE,
    [
      { op: 'set', path: ['provider'], value: row.provider.id },
      { op: 'set', path: ['model'], value: model },
    ],
    undefined,
  )
  return outcome.kind === 'written' ? undefined : outcome.message
}

/**
 * Hide one route from the panel. The route itself is untouched — hiding is a
 * panel preference, not a configuration change.
 * @param operations - the panel's Host operations.
 * @param hidden - the current hidden list.
 * @param id - the route to hide.
 * @returns the failure message, or undefined once the write landed.
 */
export async function hideRoute(
  operations: CasualOperations,
  hidden: readonly string[],
  id: string,
): Promise<string | undefined> {
  const outcome = await operations.writeSettings(
    CASUAL_PROVIDERS_NAMESPACE,
    [{ op: 'set', path: ['hidden'], value: [...hidden, id] }],
    undefined,
  )
  return outcome.kind === 'written' ? undefined : outcome.message
}

/** One row's state dot plus its accessible text. */
function RowState({ row, t }: { row: QuickSetupRow; t: Translate }): ReactElement {  if (!row.known) {
    return <><StateDot state="idle" /><span className={styles.state}>{t('stateUnknownRoute')}</span></>
  }
  if (row.error !== undefined) {
    return <><StateDot state="error" /><span className={styles.state}>{t('stateUnknown')}</span></>
  }
  if (row.active) return <><StateDot state="done" /><span className={styles.state}>{t('stateActive')}</span></>
  if (row.configured) return <><StateDot state="done" /><span className={styles.state}>{t('stateReady')}</span></>
  if (row.keyConfigured === true) {
    return <><StateDot state="warning" /><span className={styles.state}>{t('stateKeyOnly')}</span></>
  }
  if (row.keyConfigured === false) {
    return <><StateDot state="idle" /><span className={styles.state}>{t('stateKeyMissing')}</span></>
  }
  return <><StateDot state="idle" /><span className={styles.state}>{t('stateUnknown')}</span></>
}

/** One provider row: identity, state, key field, and actions. */
function ProviderRow({
  row,
  draft,
  disabled,
  t,
  onKeyChange,
  onSave,
  onDefault,
  onRemove,
  onHide,
}: {
  row: QuickSetupRow
  draft: RowDraft
  disabled: boolean
  t: Translate
  onKeyChange: (value: string) => void
  onSave: () => void
  onDefault: () => void
  onRemove: () => void
  onHide: () => void
}): ReactElement {
  const { provider } = row
  const pastesKey = provider.auth === 'key'
  const busy = disabled || draft.busy
  return (
    <li className={styles.row}>
      <div className={styles.rowHead}>
        <span className={styles.label}>{provider.label}</span>
        <code className={styles.routeId}>{provider.id}</code>
        <span className={styles.stateRow}>
          <RowState row={row} t={t} />
          {row.isDefault ? <span className={styles.badge}>{t('defaultBadge')}</span> : null}
        </span>
      </div>
      <p className={styles.blurb}>{provider.blurb}</p>
      {provider.auth === 'signin' ? <p className={styles.hint}>{t('signinHint')}</p> : null}
      {provider.auth === 'ambient' ? <p className={styles.hint}>{t('ambientHint')}</p> : null}

      {pastesKey
        ? (
          <form
            className={styles.keyForm}
            onSubmit={(event: FormEvent) => { event.preventDefault(); onSave() }}
          >
            <Input
              aria-label={`${t('keyLabel')} — ${provider.label}`}
              autoComplete="off"
              className={styles.keyInput}
              disabled={busy}
                  placeholder={provider.keyHint !== undefined && provider.keyHint.length > 0
                  ? provider.keyHint
                  : t('keyPlaceholder')}
              type="password"
              value={draft.keyValue}
              onChange={(event) => { onKeyChange(event.target.value) }}
            />
            <Button disabled={busy} size="sm" type="submit" variant="primary">
              {draft.busy ? t('saving') : t('save')}
            </Button>
          </form>
        )
        : null}

      <div className={styles.actions}>
        {pastesKey && provider.docsUrl !== undefined
          ? (
            <a className={styles.link} href={provider.docsUrl} rel="noreferrer noopener" target="_blank">
              {t('getKey')}
            </a>
          )
          : null}
        {provider.suggestedModel !== undefined && !row.isDefault
          ? (
            <Button disabled={busy || !row.configured} onClick={onDefault} size="sm" variant="ghost">
              {t('makeDefault')}
            </Button>
          )
          : null}
        {row.removable
          ? (
            <Button disabled={busy} onClick={onRemove} size="sm" variant="ghost">
              {t('remove')}
            </Button>
          )
          : null}
        <Button disabled={busy} onClick={onHide} size="sm" variant="toolbar">
          {t('hide')}
        </Button>
      </div>

      {draft.message !== undefined
        ? (
          <p className={draft.message.tone === 'ok' ? styles.ok : styles.error}>{draft.message.text}</p>
        )
        : null}
      {pastesKey ? <p className={styles.note}>{t('docsNote')}</p> : null}
    </li>
  )
}

/**
 * The panel itself. Reads only from the injected snapshot; every mutation
 * goes through the injected operations and is followed by a refresh, so the
 * Host's pushed answer — not local optimism — decides what renders next.
 * @param props - the inject face spread by the renderer.
 * @returns the panel element, or nothing before the first load.
 */
export function QuickSetupPanel(props: QuickSetupProps): ReactElement | null {
  const { operations, refresh, t, useSnapshot } = props
  const state = useSnapshot(value => value)
  const [drafts, setDrafts] = useState<Record<string, RowDraft>>({})

  // The first read happens here, on mount, and nowhere else. It cannot happen
  // at registration — the panel's whole point is that an unopened Models page
  // costs no wire reads — and it cannot be left to the pushed invalidations,
  // because those only refresh a store that has already loaded. Skipping this
  // effect leaves `status: 'idle'`, which this component renders as nothing:
  // a plugin that mounts cleanly and silently shows no UI at all.
  useEffect(() => {
    void refresh()
  }, [refresh])

  const patch = useCallback((id: string, next: Partial<RowDraft>): void => {
    setDrafts((current) => ({ ...current, [id]: { ...(current[id] ?? freshDraft()), ...next } }))
  }, [])

  /**
   * Run one write, reporting the Host's own refusal rather than a local one,
   * then reload so the snapshot reflects what actually landed.
   */
  const run = useCallback(async (
    id: string,
    label: string,
    task: () => Promise<string | undefined>,
    successKey: QuickSetupKey,
  ): Promise<void> => {
    patch(id, { busy: true, message: undefined })
    const failure = await task()
    if (failure === undefined) {
      patch(id, { busy: false, keyValue: '', message: { tone: 'ok', text: t(successKey, { name: label }) } })
      await refresh()
      return
    }
    patch(id, {
      busy: false,
      message: {
        tone: 'error',
        text: failure === 'no-model' ? t('noSuggestedModel') : failure,
      },
    })
  }, [patch, refresh, t])

  // Nothing is rendered before the first read settles. Rendering the panel body
  // during `loading` would show an empty catalog *and* the "adapter is not
  // mounted" notice — both of which are statements about state the Host has not
  // answered yet, and both of which would be wrong within a few hundred
  // milliseconds.
  if (state.status === 'idle' || state.status === 'loading') return null

  if (state.status === 'error') {
    return (
      <section className={styles.panel}>
        <h3 className={styles.title}>{t('panelTitle')}</h3>
        <p className={styles.error}>{state.error}</p>
      </section>
    )
  }

  if (!state.prefs.quickSetup) {
    return (
      <section className={styles.panel}>
        <Button
          onClick={() => {
            void run('__panel__', t('panelTitle'), async () => {
              const outcome = await operations.writeSettings(
                CASUAL_PROVIDERS_NAMESPACE,
                [{ op: 'set', path: ['quickSetup'], value: true }],
                undefined,
              )
              return outcome.kind === 'written' ? undefined : outcome.message
            }, 'restore')
          }}
          size="sm"
          variant="ghost"
        >
          {t('restore')}
        </Button>
      </section>
    )
  }

  const disabled = !state.writable || !state.adapterMounted
  const { rows } = state

  return (
    <section className={styles.panel}>
      <header className={styles.head}>
        <div>
          <h3 className={styles.title}>{t('panelTitle')}</h3>
          <p className={styles.intro}>{t('panelBlurb')}</p>
        </div>
        <Button
          onClick={() => {
            void operations.writeSettings(
              CASUAL_PROVIDERS_NAMESPACE,
              [{ op: 'set', path: ['quickSetup'], value: false }],
              undefined,
            ).then(() => refresh())
          }}
          size="sm"
          variant="toolbar"
        >
          {t('dismiss')}
        </Button>
      </header>

      {!state.adapterMounted ? <p className={styles.notice}>{t('stateNotMounted')}</p> : null}
      {state.credentialError !== null ? <p className={styles.notice}>{t('stateUnknown')}</p> : null}
      {rows.length === 0 && state.defaultSelection === undefined
        ? <p className={styles.notice}>{t('nothingConfigured')}</p>
        : null}

      {CASUAL_GROUP_ORDER.map((group: CasualGroup) => {
        const groupRows = rows.filter(row => row.provider.group === group)
        if (groupRows.length === 0) return null
        return (
          <div key={group} className={styles.group}>
            <h4 className={styles.groupTitle}>{t(groupKey(group))}</h4>
            <ul className={styles.rows}>
              {groupRows.map((row) => (
                <ProviderRow
                  key={row.provider.id}
                  disabled={disabled}
                  draft={drafts[row.provider.id] ?? freshDraft()}
                  row={row}
                  t={t}
                  onDefault={() => {
                    void run(row.provider.id, row.provider.label, async () =>
                      selectDefault(operations, row), 'defaultSet')
                  }}
                  onHide={() => {
                    void run(row.provider.id, row.provider.label, async () =>
                      hideRoute(operations, state.prefs.hidden, row.provider.id), 'saved')
                  }}
                  onKeyChange={(value) => { patch(row.provider.id, { keyValue: value, message: undefined }) }}
                  onRemove={() => {
                    if (globalThis.confirm?.(t('remove')) === false) return
                    void run(row.provider.id, row.provider.label, async () =>
                      removeRoute(operations, row), 'removed')
                  }}
                  onSave={() => {
                    void (async () => {
                      const checked = normalizeApiKey(drafts[row.provider.id]?.keyValue ?? '')
                      if (!checked.ok) {
                        patch(row.provider.id, {
                          message: {
                            tone: 'error',
                            text: checked.reason === 'empty' ? t('keyPlaceholder') : t('stateUnknown'),
                          },
                        })
                        return
                      }
                      patch(row.provider.id, { busy: true, message: undefined })
                      const failure = await configureRoute(operations, row, checked.key)
                      if (failure === undefined) {
                        patch(row.provider.id, {
                          busy: false,
                          keyValue: '',
                          message: { tone: 'ok', text: t('saved', { name: row.provider.label }) },
                        })
                        await refresh()
                        return
                      }
                      patch(row.provider.id, { busy: false, message: { tone: 'error', text: failure } })
                    })()
                  }}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
