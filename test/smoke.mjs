/**
 * Client-bundle smoke test.
 *
 * The browser half of a dsh plugin ships as a Lazy-CJS factory behind
 * `window.__ModuleLoader__.load`, which no Node test runner will execute on
 * its own — so the thing most likely to break (a malformed envelope, an
 * external that is not in the platform seed table, an `apply` that throws
 * before it registers) is exactly the thing a typecheck cannot see.
 *
 * This test evaluates the *built* `lib/client.js` the way the client module
 * system does, with the four seed-table modules stubbed, then drives `apply`
 * against a fake cordis context and asserts what it registered. It is a smoke
 * test, not a unit test: it proves the bundle is well-formed and wires itself
 * up, not that any rendered pixel is correct.
 *
 * Run with `pnpm test` after `pnpm build`.
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const BUNDLE = join(ROOT, 'lib', 'client.js')

/** Specifiers the web shell pre-seeds; a `require` of anything else throws. */
const PLATFORM_MODULES = new Set([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store',
  '@deepseek-ai/dsh-client-ui-primitives',
  '@deepseek-ai/dsh-client-ui-slots',
])

/** A minimal React surface: the browser half only uses hooks and elements. */
function stubReact() {
  return {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useCallback: (fn) => fn,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useId: () => 'cp-test',
  }
}

/** A jsx runtime that produces inert nodes instead of calling React. */
function stubJsxRuntime() {
  const element = (type, props) => ({ type, props })
  return { jsx: element, jsxs: element, jsxDEV: element, Fragment: Symbol('Fragment') }
}

/** A snapshot store good enough for the store's own read/update discipline. */
function stubCreateSnapshotStore(init) {
  let value = init
  const listeners = new Set()
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    update(mutator) {
      mutator(value)
      for (const listener of [...listeners]) listener()
    },
    set(next) {
      value = next
      for (const listener of [...listeners]) listener()
    },
  }
}

const PRIMITIVES = {
  Button: 'Button',
  Input: 'Input',
  StateDot: 'StateDot',
  Tag: 'Tag',
  Modal: 'Modal',
}

/** Evaluate the built bundle and hand back its registration. */
function loadBundle() {
  const source = readFileSync(BUNDLE, 'utf8')
  let registration
  const appended = []
  const documentStub = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (node) => appended.push(node) },
  }
  const sandbox = {
    window: {
      __ModuleLoader__: {
        mode: 'queue',
        pendingQueue: [],
        load: (row) => { registration = row },
        create: () => { throw new Error('not used by this test') },
      },
    },
    document: documentStub,
    console,
    Symbol,
    Object,
    Array,
    Promise,
    Set,
    Map,
    JSON,
    structuredClone,
    RegExp,
    Date,
    Math,
  }
  sandbox.globalThis = sandbox
  vm.createContext(sandbox)
  vm.runInContext(source, sandbox, { filename: BUNDLE })
  assert.ok(registration, 'the bundle must register a factory through __ModuleLoader__.load')
  return { registration, appended }
}

/**
 * Materialize the factory the way the module system does: resolve every
 * external against the seed table, and fail loudly on anything else — which is
 * the actual runtime behavior this test exists to protect.
 * @param registration - the captured `__ModuleLoader__.load` argument.
 * @returns the bundle's exports.
 */
function materialize(registration) {
  const modules = new Map([
    ['react', stubReact()],
    ['react/jsx-runtime', stubJsxRuntime()],
    ['@deepseek-ai/dsh-client-store', { createSnapshotStore: stubCreateSnapshotStore }],
    ['@deepseek-ai/dsh-client-ui-primitives', PRIMITIVES],
  ])
  const requireStub = (specifier) => {
    if (!PLATFORM_MODULES.has(specifier)) {
      throw new Error(`client bundle requires a non-platform module: ${specifier}`)
    }
    const module = modules.get(specifier)
    if (module === undefined) {
      throw new Error(`client bundle requires an unseeded platform module: ${specifier}`)
    }
    return module
  }
  const exports = registration.factory(requireStub)
  return { exports, seen: [...modules.keys()] }
}

/** A settings view for one namespace, as `settings.describe` would report it. */
function namespaceView(ns, value, revision = 1) {
  return { ns, value, base: value, user: value, revision, schema: {}, secrets: [] }
}

/**
 * Build a fake browser cordis context that records what `apply` did.
 * @returns the context plus the recording surfaces the assertions read.
 */
function fakeContext() {
  const record = {
    dictionaries: [],
    effects: [],
    slotInjections: [],
    registrations: [],
    remoteSubscriptions: [],
    eventSubscriptions: [],
    mirrorLoads: 0,
  }
  const mirror = {
    ensure: async () => { record.mirrorLoads += 1 },
    getSnapshot: () => ({
      status: 'ready',
      error: null,
      view: {
        writable: true,
        hasDocument: true,
        namespaces: [
          namespaceView('llm-pi-ai', { providers: { openai: { apiKeyEnv: 'OPENAI_API_KEY' } } }),
          namespaceView('agent-default-model', { provider: 'openai', model: 'gpt-5.4' }),
          namespaceView('casual-providers', {
            quickSetup: true,
            autoSelectDefault: true,
            pinned: ['anthropic'],
            hidden: ['huggingface'],
          }),
        ],
      },
    }),
    subscribe: () => () => {},
    acceptView: () => {},
  }
  const ctx = {
    effect(fn, label) {
      record.effects.push(label)
      const disposer = fn()
      return () => { if (typeof disposer === 'function') disposer() }
    },
    locale: {
      register(ns, dict) {
        record.dictionaries.push({ ns, dict })
        return () => {}
      },
      bind: (ns) => (key, params) => {
        const entry = record.dictionaries.find(d => d.ns === ns)
        const text = entry?.dict.en[key] ?? key
        return params === undefined
          ? text
          : text.replace(/\{(\w+)\}/g, (whole, name) => String(params[name] ?? whole))
      },
    },
    remote: {
      credentials: {
        describe: async () => ({ ok: true, value: { OPENAI_API_KEY: { configured: true } } }),
        set: async () => ({ ok: true, value: undefined }),
        unset: async () => ({ ok: true, value: undefined }),
      },
      settings: {
        mutate: async () => ({ ok: true, value: namespaceView('llm-pi-ai', {}) }),
      },
      llm: {
        listProviders: async () => ({ ok: true, value: [{ id: 'openai', name: 'OpenAI' }] }),
        listConfigurableProviders: async () => ({
          ok: true,
          value: [{ provider: 'anthropic', displayName: 'Anthropic', settingsNs: 'llm-pi-ai', settingsPath: ['providers', 'anthropic'] }],
        }),
      },
      $on: (event, handler) => {
        record.remoteSubscriptions.push(event)
        return () => {}
      },
    },
    settingsScope: {
      describe: () => mirror,
    },
    slots: {
      inject(slot, callback) {
        record.slotInjections.push(slot)
        callback()
        return () => {}
      },
      register(spec, component) {
        record.registrations.push({ spec, component })
        return () => {}
      },
    },
    on: (event, handler) => {
      record.eventSubscriptions.push(event)
      return () => { handler() }
    },
  }
  return { ctx, record }
}

/** Run the test suite. */
async function main() {
  const { registration, appended } = loadBundle()

  assert.equal(registration.id, 'dsh-casual-providers', 'factory id must match the graph row')
  assert.equal(typeof registration.factory, 'function', 'factory must be callable')
  assert.equal(typeof registration.chunk, 'undefined', 'the package entry declares no chunk')

  const { exports } = materialize(registration)
  assert.equal(typeof exports.apply, 'function', 'the bundle must export apply')
  assert.ok(Array.isArray(exports.inject), 'the bundle must declare its inject list')
  assert.equal(exports.name, 'casual-providers')

  for (const service of exports.inject) {
    assert.ok(
      ['slots', 'locale', 'remote', 'settingsScope'].includes(service)
      || service.startsWith('remote.'),
      `unexpected injected service: ${service}`,
    )
  }

  const { ctx, record } = fakeContext()
  exports.apply(ctx)

  assert.deepEqual(
    record.dictionaries.map(d => d.ns),
    ['casual-providers'],
    'exactly one dictionary namespace, and it is our own',
  )
  assert.ok(
    record.effects.includes('casual-providers: copy dictionaries'),
    'the dictionary must register inside a labeled effect',
  )
  assert.equal(appended.length, 1, 'panel styles inject exactly once')
  assert.equal(appended[0].dataset.plugin, 'dsh-casual-providers')

  assert.deepEqual(
    record.slotInjections,
    ['settings.models.footer', 'settings.models.provider-card'],
    'both Models-page seats must be joined',
  )

  const footer = record.registrations.find(r => r.spec.name === 'settings.models.footer')
  assert.ok(footer, 'the footer seat must carry a registration')
  assert.equal(footer.spec.id, 'casual-providers')
  assert.equal(footer.spec.locale, 'casual-providers')
  assert.equal(typeof footer.spec.inject, 'function')

  const card = record.registrations.find(r => r.spec.name === 'settings.models.provider-card')
  assert.ok(card, 'the provider-card seat must carry a registration')
  assert.equal(card.spec.key, 'llm-pi-ai', 'the card seat keys on the pi-ai adapter namespace')

  // The panel is a pure function of its props, so its render path can be
  // exercised directly once the registrations are in place.
  const injected = footer.spec.inject()
  assert.equal(typeof injected.operations.writeSettings, 'function')
  assert.equal(typeof injected.refresh, 'function')
  assert.ok(injected.hooks.snapshot, 'the store handle must be passed as the hooks seat')

  const snapshot = injected.hooks.snapshot.getSnapshot()
  assert.equal(snapshot.status, 'idle', 'the panel starts unloaded so an unopened page costs no reads')

  // Drive one load through the fake remotes and assert the join.
  await injected.refresh()
  const loaded = injected.hooks.snapshot.getSnapshot()
  assert.equal(loaded.status, 'ready')
  assert.equal(loaded.writable, true)
  assert.equal(loaded.adapterMounted, true)
  assert.equal(loaded.defaultSelection?.provider, 'openai')
  assert.equal(loaded.defaultSelection?.model, 'gpt-5.4')
  assert.equal(loaded.prefs.pinned[0], 'anthropic')

  const openai = loaded.rows.find(row => row.provider.id === 'openai')
  assert.equal(openai?.configured, true, 'a route in the section reads as configured')
  assert.equal(openai?.active, true, 'a route in the live table reads as serving')
  assert.equal(openai?.isDefault, true)
  assert.equal(openai?.keyConfigured, true, 'a stored credential reads as present')

  const hidden = loaded.rows.find(row => row.provider.id === 'huggingface')
  assert.equal(hidden, undefined, 'a hidden route leaves the panel')

  const pinnedFirst = loaded.rows[0]
  assert.equal(pinnedFirst.provider.id, 'anthropic', 'pins lead the panel')

  console.log('client bundle smoke test: OK')
}

await main()
