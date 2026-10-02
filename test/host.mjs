/**
 * Host-bundle smoke test.
 *
 * The Host half is small but load-bearing: the Loader imports it by package
 * name, and a throw here would either fail the whole profile or — worse, with
 * a plugin whose failure is tolerated — leave the browser half serving with no
 * settings namespace behind it. So this test imports the *built* `lib/index.js`
 * exactly as the Loader would, and asserts the two facts that matter:
 *
 *   1. it is a cordis function plugin (named exports, no default), because a
 *      default export would make the Loader discard the namespace; and
 *   2. it registers the page policy through the optional `settings` child, so
 *      the entry's volatile fields stay writable while its automatic settings
 *      page stays suppressed.
 *
 * Run with `pnpm test` after `pnpm build`.
 */

import assert from 'node:assert/strict'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Import the built Host entry the way the Loader resolves `name:`. */
const plugin = await import(join(ROOT, 'lib', 'index.js'))

assert.equal(plugin.name, 'casual-providers', 'the plugin must name itself for loader diagnostics')
assert.equal(typeof plugin.apply, 'function', 'a cordis function plugin exports apply')
assert.equal(plugin.default, undefined, 'a default export would make the Loader discard the namespace')
assert.ok(Array.isArray(plugin.inject), 'inject must be declared even when empty')

// The Config schema is this entry's settings namespace, keyed by the profile
// row id. Volatile fields are the only ones a client may write, so all four
// preferences must be volatile or every write would be refused.
//
// `z.object()` keeps its field schemas on `.dict`, and resolving a section
// returns `Volatile` wrappers whose `.get()` yields the plain value — the shape
// a plugin reads its own configuration through.
const fields = plugin.Config.dict
for (const field of ['quickSetup', 'autoSelectDefault', 'pinned', 'hidden']) {
  assert.ok(field in fields, `Config must declare ${field}`)
  assert.equal(fields[field].meta.volatile, true, `${field} must be volatile to be a durable preference`)
}

const empty = plugin.Config({})
assert.equal(empty.quickSetup.get(), true, 'omitting a layer must resolve the schema default')
assert.equal(empty.autoSelectDefault.get(), true)
assert.deepEqual(empty.pinned.get(), [])
assert.deepEqual(empty.hidden.get(), [])

assert.equal(plugin.Config({ quickSetup: false }).quickSetup.get(), false)
assert.deepEqual(plugin.Config({ hidden: ['openai'] }).hidden.get(), ['openai'])

/** A cordis-shaped fake: enough context for `apply` and its settings child. */
const calls = { configured: [], injected: [], effects: [] }
const fiber = { id: 'casual-providers' }
const ctx = {
  fiber,
  inject(names, callback) {
    calls.injected.push(names)
    callback({
      effect(fn, label) {
        calls.effects.push(label)
        const disposer = fn()
        return () => { if (typeof disposer === 'function') disposer() }
      },
      settings: {
        configure(presentation, owner) {
          calls.configured.push({ presentation, owner })
          return () => {}
        },
      },
    })
    return () => {}
  },
}

plugin.apply(ctx)

assert.deepEqual(calls.injected, [['settings']], 'the settings child must be optional, not required')
assert.equal(calls.configured.length, 1, 'exactly one page policy')
assert.deepEqual(calls.configured[0].presentation, { auto: false }, 'the automatic settings page must be suppressed')
assert.equal(calls.configured[0].owner, fiber, 'the policy must name the plugin fiber it belongs to')

// The service is declared as injectable, so mounting without Settings is legal:
// the child simply never runs.
const before = calls.effects.length
const withoutSettings = { fiber, inject: () => () => {} }
plugin.apply(withoutSettings)
assert.equal(calls.effects.length, before, 'mounting without Settings must be a no-op, not a throw')
assert.equal(calls.configured.length, 1, 'no policy may be registered without the service')

console.log('host bundle smoke test: OK')
