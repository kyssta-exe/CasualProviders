/**
 * Quick Setup panel store: one snapshot joining the curated catalog in
 * `../catalog.ts` with what the Host actually reports — the configurable
 * provider directory, the live route table, the `llm-pi-ai` and
 * `agent-default-model` settings sections, and the credential state of each
 * route's derived reference.
 *
 * The Host stays the single fact source. Nothing here infers configuration
 * from local state: a row is "configured" only because a settings section
 * says so, and a key is "present" only because `credentials/describe` said
 * so. Every mutation writes through the wire and the panel re-renders from
 * the pushed invalidation that follows.
 */

import type { SettingsDescribeFace } from '@deepseek-ai/dsh-client-ui-settings/client'
import type { SettingsNamespaceView } from '@deepseek-ai/dsh-api-remotes/client'
import type { SnapshotStore } from '@deepseek-ai/dsh-client-store'
import { createSnapshotStore } from '@deepseek-ai/dsh-client-store'
import type { CasualProvider } from '../catalog.ts'
import { CASUAL_BY_ID, CASUAL_GROUP_ORDER, CASUAL_PROVIDERS, deriveKeyRef } from '../catalog.ts'
import type { ResolvedQuickSetupSettings } from '../contract.ts'
import { CASUAL_PROVIDERS_NAMESPACE, DEFAULT_MODEL_NAMESPACE, PI_AI_NAMESPACE } from '../contract.ts'
import { QUICK_SETUP_DEFAULTS } from '../contract.ts'
import type { CasualOperations } from './operations.ts'

/** The process-wide default model selection, as the settings section holds it. */
export interface DefaultSelection {
  provider: string
  model: string
  reasoningEffort?: string
}

/** One curated route joined with everything the Host reports about it. */
export interface QuickSetupRow {
  /** The curated catalog entry this row renders. */
  provider: CasualProvider
  /** Whether pi-ai's installed catalog describes this route id. */
  known: boolean
  /** Whether a route is registered and serving right now. */
  active: boolean
  /** Whether the adapter reports the route as one it does not ship. */
  declared: boolean
  /** Whether any layer (composition or user) configures this route. */
  configured: boolean
  /** Whether the user layer alone carries the profile, so removal would stick. */
  removable: boolean
  /** The adapter's repair diagnostic, when it reported one. */
  error?: string
  /** Credential reference the resolved profile names, if any. */
  keyRef?: string
  /** Confirmed credential state for {@link keyRef}; undefined while unknown. */
  keyConfigured?: boolean
  /** Whether the process default currently points at this route. */
  isDefault: boolean
}

/** Panel snapshot. */
export interface QuickSetupState {
  status: 'idle' | 'loading' | 'ready' | 'error'
  /** Whole-load failure text; row-level write failures stay in the row. */
  error: string | null
  /** Credential enrichment failure; rows stay usable without it. */
  credentialError: string | null
  /** Whether the settings document accepts writes. */
  writable: boolean
  /** Whether the pi-ai adapter registered its settings namespace at all. */
  adapterMounted: boolean
  /** Durable panel preferences. */
  prefs: ResolvedQuickSetupSettings
  /** The process default selection, when the section names one. */
  defaultSelection: DefaultSelection | undefined
  /** One row per curated route, in group order. */
  rows: readonly QuickSetupRow[]
}

/** Read one settings section by namespace, tolerating an absent namespace. */
function sectionOf(view: readonly SettingsNamespaceView[], ns: string): SettingsNamespaceView | undefined {
  return view.find(candidate => candidate.ns === ns)
}

/** Narrow an unknown settings section to a plain object, or undefined. */
function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

/**
 * Read one provider profile out of an `llm-pi-ai` section.
 * @param section - the raw namespace value.
 * @param provider - route id.
 * @returns the profile object, or undefined when the section omits it.
 */
function profileOf(section: unknown, provider: string): Record<string, unknown> | undefined {
  const providers = asRecord(asRecord(section)?.providers)
  return asRecord(providers?.[provider])
}

/** Read a string field, ignoring a non-string the schema would have refused. */
function stringField(record: Record<string, unknown> | undefined, field: string): string | undefined {
  const value = record?.[field]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

/** Read the pinned/hidden lists, dropping anything that is not a string. */
function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : []
}

/** Read the durable preferences out of the plugin's own settings section. */
function prefsOf(section: unknown): ResolvedQuickSetupSettings {
  const record = asRecord(section)
  if (record === undefined) return QUICK_SETUP_DEFAULTS
  return {
    quickSetup: record.quickSetup !== false,
    autoSelectDefault: record.autoSelectDefault !== false,
    pinned: stringList(record.pinned),
    hidden: stringList(record.hidden),
  }
}

/**
 * Order rows: pinned first (in pin order), then group order, then catalog
 * order inside a group. Hiding removes a row entirely.
 * @param rows - rows in catalog order.
 * @param prefs - durable panel preferences.
 * @returns the visible rows in render order.
 */
export function orderRows(rows: readonly QuickSetupRow[], prefs: ResolvedQuickSetupSettings): QuickSetupRow[] {
  const hidden = new Set(prefs.hidden)
  const pinRank = new Map(prefs.pinned.map((id, index) => [id, index]))
  const groupRank = new Map(CASUAL_GROUP_ORDER.map((group, index) => [group, index]))
  return rows
    .filter(row => !hidden.has(row.provider.id))
    .slice()
    .sort((a, b) => {
      const pinA = pinRank.get(a.provider.id)
      const pinB = pinRank.get(b.provider.id)
      if (pinA !== undefined || pinB !== undefined) {
        if (pinA === undefined) return 1
        if (pinB === undefined) return -1
        return pinA - pinB
      }
      return (groupRank.get(a.provider.group) ?? 99) - (groupRank.get(b.provider.group) ?? 99)
    })
}

/**
 * Owns the panel snapshot and every refresh that replaces it.
 */
export class QuickSetupStore {
  /** The snapshot seat the renderer binds as a React hook. */
  readonly store: SnapshotStore<QuickSetupState>

  private inFlight: Promise<void> | undefined

  /**
   * @param operations - the panel's Host operations.
   * @param describe - the shared settings describe face every settings consumer derives from.
   */
  constructor(
    private readonly operations: CasualOperations,
    private readonly describe: SettingsDescribeFace,
  ) {
    this.store = createSnapshotStore<QuickSetupState>({
      status: 'idle',
      error: null,
      credentialError: null,
      writable: false,
      adapterMounted: false,
      prefs: QUICK_SETUP_DEFAULTS,
      defaultSelection: undefined,
      rows: [],
    })
  }

  /**
   * Re-read the joined snapshot. Concurrent calls fold into the in-flight read
   * plus one rerun, so an invalidation arriving mid-read is never lost.
   * @returns settlement of the read.
   */
  async load(): Promise<void> {
    if (this.inFlight !== undefined) {
      await this.inFlight
      return this.load()
    }
    const read = this.read().finally(() => {
      if (this.inFlight === read) this.inFlight = undefined
    })
    this.inFlight = read
    await read
  }

  /**
   * Refresh only after the panel has loaded once, so an unopened Models page
   * costs no wire reads on background invalidations.
   */
  refreshIfLoaded(): void {
    if (this.store.getSnapshot().status === 'idle') return
    void this.load()
  }

  /** Drop back to the unloaded posture (used on connection reset). */
  reset(): void {
    this.store.set({
      status: 'idle',
      error: null,
      credentialError: null,
      writable: false,
      adapterMounted: false,
      prefs: QUICK_SETUP_DEFAULTS,
      defaultSelection: undefined,
      rows: [],
    })
  }

  /** One read: mirror, directory, then credential enrichment. */
  private async read(): Promise<void> {
    this.store.update((draft) => {
      draft.status = 'loading'
      draft.error = null
    })
    try {
      await this.describe.ensure()
      const mirror = this.describe.getSnapshot()
      if (mirror.view === undefined) {
        this.store.update((draft) => {
          draft.status = 'error'
          draft.error = mirror.error ?? 'settings unavailable'
        })
        return
      }
      const namespaces = mirror.view.namespaces
      const directory = await this.operations.listDirectory()
      if (directory.kind === 'refused') {
        this.store.update((draft) => {
          draft.status = 'error'
          draft.error = directory.message
          draft.writable = mirror.view?.writable ?? false
        })
        return
      }

      const piAi = sectionOf(namespaces, PI_AI_NAMESPACE)
      const piAiUser = asRecord(asRecord(piAi?.user)?.providers)
      const defaultView = sectionOf(namespaces, DEFAULT_MODEL_NAMESPACE)
      const defaultSection = asRecord(defaultView?.value)
      const defaultProvider = stringField(defaultSection, 'provider')
      const defaultSelection: DefaultSelection | undefined = defaultProvider === undefined
        ? undefined
        : {
          provider: defaultProvider,
          model: stringField(defaultSection, 'model') ?? '',
          ...stringField(defaultSection, 'reasoningEffort') === undefined
            ? {}
            : { reasoningEffort: stringField(defaultSection, 'reasoningEffort') as string },
        }

      const declaredById = new Map(directory.declared.map(entry => [entry.provider, entry]))
      const liveIds = new Set(directory.registered.map(entry => entry.id))
      const prefs = prefsOf(sectionOf(namespaces, CASUAL_PROVIDERS_NAMESPACE)?.value)

      const rows: QuickSetupRow[] = CASUAL_PROVIDERS.map((provider) => {
        const declaration = declaredById.get(provider.id)
        const profile = profileOf(piAi?.value, provider.id)
        const userProfile = asRecord(piAiUser?.[provider.id])
        return {
          provider,
          known: declaration !== undefined,
          active: liveIds.has(provider.id),
          declared: declaration?.declared === true,
          configured: profile !== undefined,
          removable: userProfile !== undefined,
          ...declaration?.error === undefined ? {} : { error: declaration.error },
          keyRef: stringField(profile, 'apiKeyEnv')
            ?? (provider.auth === 'key' ? provider.keyRef ?? deriveKeyRef(provider.id) : undefined),
          isDefault: defaultProvider === provider.id,
        }
      })

      // Credential reads are enrichment: a refusal must not empty the panel,
      // it only leaves the key dots unknown.
      let credentialError: string | null = null
      const refs = [...new Set(rows.map(row => row.keyRef).filter((ref): ref is string => ref !== undefined))]
      const described = new Map<string, boolean>()
      if (refs.length > 0) {
        const responses = await Promise.all(refs.map(async (ref) => {
          const info = await this.operations.describeCredential(ref)
          return [ref, info] as const
        }))
        for (const [ref, info] of responses) {
          if (info === undefined) {
            credentialError = credentialError ?? 'credential state unavailable'
            continue
          }
          described.set(ref, info.configured)
        }
      }
      for (const row of rows) {
        if (row.keyRef === undefined) continue
        const configured = described.get(row.keyRef)
        if (configured !== undefined) row.keyConfigured = configured
      }

      this.store.set({
        status: 'ready',
        error: null,
        credentialError,
        writable: mirror.view.writable,
        adapterMounted: piAi !== undefined,
        prefs,
        defaultSelection,
        rows: orderRows(rows, prefs),
      })
    } catch (error) {
      this.store.update((draft) => {
        draft.status = 'error'
        draft.error = error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Report whether a curated route is one the installed catalog describes.
   * Exported for the card extension, which reads rows straight from the
   * snapshot and must not offer setup for a route that cannot resolve.
   * @param id - route id.
   * @returns whether the catalog ships the route.
   */
  static known(id: string): boolean {
    return CASUAL_BY_ID.has(id)
  }
}
