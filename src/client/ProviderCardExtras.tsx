/**
 * The compact Quick Setup control this plugin contributes to the Models page's
 * `settings.models.provider-card` slot.
 *
 * The footer panel is the discovery surface; this is the convenience surface.
 * Whichever card a user is already looking at — including the dormant
 * first-run setup card for a provider nobody has configured yet — carries a
 * key field and a one-click default, so configuring a provider never requires
 * scrolling to the panel below.
 *
 * Registration is keyed on `llm-pi-ai`, the settings namespace whose sections
 * *are* provider profiles. One registration therefore receives every card of
 * that adapter family, hand-declared routes included; a card whose route this
 * catalog does not curate renders nothing, because the panel is the surface
 * that explains what to do about a route it does not know.
 */

import { useCallback, useState } from 'react'
import type { FormEvent, ReactElement } from 'react'
import { Button, Input } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { PropsLocale, PropsRuntime, SlotInjectFace } from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the Models page's SlotMap merge (the two child seats) and
// its owner-prop types.
import type {} from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { ProviderCardExtrasOwnerProps } from '@deepseek-ai/dsh-client-ui-settings-models/client'
import type { CasualOperations } from './operations.ts'
import type { QuickSetupRow, QuickSetupState } from './store.ts'
import type { CasualProvider } from '../catalog.ts'
import { CASUAL_BY_ID, deriveKeyRef } from '../catalog.ts'
import { PI_AI_NAMESPACE } from '../contract.ts'
import { styles } from './panel-styles.ts'

/**
 * Registration-side business face for the per-card control. `hooks.snapshot` is
 * the reserved compartment, so the renderer binds it to `useSnapshot` and the
 * card re-renders when the panel's joined snapshot changes.
 */
export interface ProviderCardInjected {
  /** Panel operations bound to this plugin's Remote namespaces. */
  operations: CasualOperations
  /** The joined panel snapshot seat, bound as `useSnapshot`. */
  hooks: { snapshot: SnapshotStore<QuickSetupState> }
  /** Reload the joined snapshot after a write. */
  refresh: () => Promise<void>
}

/**
 * Props the slot outlet delivers for this keyed seat: the framework runtime
 * share (which carries the card's `ProviderCardExtrasOwnerProps`), the declared
 * locale seat, and the registrant's injected share.
 */
export type ProviderCardProps =
  & PropsRuntime<'settings.models.provider-card'>
  & PropsLocale<'casual-providers'>
  & SlotInjectFace<ProviderCardInjected>

/**
 * The panel row for one route id, or undefined when the row is not loaded yet
 * (the card can render before the panel's first read settles).
 * @param state - the panel snapshot.
 * @param id - provider route id.
 * @returns the matching row, if the snapshot has one.
 */
function rowFor(state: QuickSetupState, id: string): QuickSetupRow | undefined {
  return state.rows.find(row => row.provider.id === id)
}

/**
 * The credential reference a row's key belongs under: the one its resolved
 * profile already names, else the conventional derived name the footer panel
 * would have written.
 * @param row - the panel row for the card's route.
 * @returns the reference name.
 */
function rowKeyRef(row: QuickSetupRow): string {
  return row.keyRef ?? deriveKeyRef(row.provider.id)
}

/**
 * The card's compact control.
 * @param props - the inject face plus the card's owner share.
 * @returns a key field and actions for curated routes, or nothing otherwise.
 */
export function ProviderCardExtras(props: ProviderCardProps): ReactElement | null {
  const { provider, configured, operations, refresh, t, useSnapshot } = props
  const state = useSnapshot(value => value)
  const curated: CasualProvider | undefined = CASUAL_BY_ID.get(provider.provider)
  const [keyValue, setKeyValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | undefined>()

  const row = rowFor(state, provider.provider)

  const save = useCallback(async (): Promise<void> => {
    if (curated === undefined || row === undefined) return
    const trimmed = keyValue.trim()
    if (trimmed.length === 0 || !/^[\x21-\x7E]+$/.test(trimmed)) {
      setMessage(t('keyRejected'))
      return
    }
    const ref = rowKeyRef(row)
    setBusy(true)
    setMessage(undefined)
    // Settings first, secret second — the same order the footer panel uses, so
    // a route the adapter refuses never leaves an orphan credential behind.
    const written = await operations.writeSettings(PI_AI_NAMESPACE, [
      { op: 'set', path: ['providers', curated.id, 'apiKeyEnv'], value: ref },
    ], undefined)
    if (written.kind !== 'written') {
      setBusy(false)
      setMessage(written.message)
      return
    }
    const refusal = await operations.storeCredential(ref, trimmed)
    setBusy(false)
    setKeyValue('')
    setMessage(refusal ?? t('saved', { name: curated.label }))
    await refresh()
  }, [curated, keyValue, operations, refresh, row, t])

  if (curated === undefined) return null

  const pastesKey = curated.auth === 'key'
  const isConfigured = configured || row?.configured === true

  return (
    <div className={styles.cardExtras}>
      {pastesKey
        ? (
          <form
            className={styles.keyForm}
            onSubmit={(event: FormEvent) => { event.preventDefault(); void save() }}
          >
            <Input
              aria-label={`${t('keyLabel')} — ${curated.label}`}
              autoComplete="off"
              className={styles.keyInput}
              disabled={busy}
              placeholder={curated.keyHint !== undefined && curated.keyHint.length > 0
                ? curated.keyHint
                : t('keyPlaceholder')}
              type="password"
              value={keyValue}
              onChange={(event) => { setKeyValue(event.target.value) }}
            />
            <Button disabled={busy} size="sm" type="submit" variant="primary">
              {busy ? t('saving') : t('save')}
            </Button>
          </form>
        )
        : null}
      {message !== undefined ? <p className={styles.note}>{message}</p> : null}
      {isConfigured && curated.suggestedModel !== undefined
        ? (
          <p className={styles.note}>
            {t('configured')} · {curated.suggestedModel}
          </p>
        )
        : null}
    </div>
  )
}
