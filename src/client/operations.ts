/**
 * Host reads and writes the Quick Setup panel performs, as callbacks built in
 * the plugin body.
 *
 * The panel never receives a context: every outcome it renders from — a
 * stored view, a stale revision, a refusal message — is named by these
 * functions, which keeps the Remote namespaces and their failure codes in the
 * apply world where they are declared.
 *
 * Every write targets a namespace the harness already registered
 * (`llm-pi-ai`, `agent-default-model`). That is legal: the settings seam
 * accepts any registered namespace from any caller, and the pi-ai adapter
 * validates the *merged* result rather than the caller's identity. It is also
 * the only durable seam — a plugin cannot write the composition layer at
 * runtime.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {
  CredentialInfo,
  LlmConfigurableProvider,
  LlmProviderInfo,
  SettingsNamespaceView,
  SettingsPathOpView,
} from '@deepseek-ai/dsh-api-remotes/client'

/** What one namespace write answered. */
export type SettingsWriteOutcome =
  /** Committed; the view carries the stored user subtree and the new revision. */
  | { readonly kind: 'written'; readonly view: SettingsNamespaceView }
  /** The stored revision moved after the panel read it, so the draft is stale. */
  | { readonly kind: 'conflict'; readonly message: string }
  /** Any other refusal, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** What one directory read answered. */
export type DirectoryOutcome =
  /** The configurable-provider directory joined with the live route table. */
  | {
    readonly kind: 'found'
    readonly declared: readonly LlmConfigurableProvider[]
    readonly registered: readonly LlmProviderInfo[]
  }
  /** The directory could not be read, with the Host's own diagnostic. */
  | { readonly kind: 'refused'; readonly message: string }

/** The Host operations the Quick Setup panel invokes. */
export interface CasualOperations {
  /**
   * Read one credential reference's state.
   * @param ref - credential reference name.
   * @returns the state, or undefined when the reference is unknown or refused.
   */
  describeCredential(ref: string): Promise<CredentialInfo | undefined>
  /**
   * Store one credential literal under its reference, write-only.
   * @param ref - credential reference name.
   * @param value - the literal to store.
   * @returns the refusal message, or undefined once stored.
   */
  storeCredential(ref: string, value: string): Promise<string | undefined>
  /**
   * Remove one credential reference (idempotent).
   * @param ref - credential reference name.
   * @returns the refusal message, or undefined once removed.
   */
  removeCredential(ref: string): Promise<string | undefined>
  /**
   * Apply path operations to one settings namespace.
   * @param ns - settings namespace identity.
   * @param ops - ordered path operations against the stored section.
   * @param expectedRevision - revision the panel read, or undefined to write unfenced.
   * @returns the write outcome the panel renders from.
   */
  writeSettings(
    ns: string,
    ops: SettingsPathOpView[],
    expectedRevision: number | undefined,
  ): Promise<SettingsWriteOutcome>
  /**
   * Read which routes exist (the whole pi-ai catalog, dormant or not) and
   * which are live right now.
   * @returns the joined directory, or the refusal.
   */
  listDirectory(): Promise<DirectoryOutcome>
}

/**
 * Bind the panel's Host operations to the plugin's own Remote namespaces.
 * @param ctx - the plugin's context, which declares `remote.credentials`,
 * `remote.llm`, and `remote.settings` in its own `inject`.
 * @returns the callbacks the panel is injected with.
 */
export function createCasualOperations(ctx: ClientContext): CasualOperations {
  return {
    describeCredential: async (ref) => {
      const response = await ctx.remote.credentials.describe([ref])
      return response.ok ? response.value[ref] : undefined
    },
    storeCredential: async (ref, value) => {
      const response = await ctx.remote.credentials.set(ref, value)
      return response.ok ? undefined : response.error.message
    },
    removeCredential: async (ref) => {
      const response = await ctx.remote.credentials.unset(ref)
      return response.ok ? undefined : response.error.message
    },
    writeSettings: async (ns, ops, expectedRevision) => {
      const response = await ctx.remote.settings.mutate(ns, ops, expectedRevision)
      if (response.ok) return { kind: 'written', view: response.value }
      const { code, message } = response.error
      return code === 'settings/conflict' ? { kind: 'conflict', message } : { kind: 'refused', message }
    },
    listDirectory: async () => {
      const [providers, configurable] = await Promise.all([
        ctx.remote.llm.listProviders(),
        ctx.remote.llm.listConfigurableProviders(),
      ])
      if (!providers.ok) return { kind: 'refused', message: providers.error.message }
      if (!configurable.ok) return { kind: 'refused', message: configurable.error.message }
      return { kind: 'found', declared: configurable.value, registered: providers.value }
    },
  }
}
