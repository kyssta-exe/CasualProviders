/**
 * Functional round-trip: configure a provider, then remove it.
 *
 * The boot check proves the panel mounts. This proves the *write path* works,
 * which is the part a broken plugin can hide behind a perfectly rendered UI:
 *
 *   1. typing a key and pressing Save writes `llm-pi-ai.providers.<id>.apiKeyEnv`
 *      into the active profile patch, and stores the literal in the credential
 *      store — two separate stores, written in that order;
 *   2. "Make default" points `agent-default-model` at the route;
 *   3. Remove deletes both again, and deletes the credential only because the
 *      profile names the exact derived reference.
 *
 * It writes to the real harness home, so it asserts the round trip leaves no
 * trace: the profile patch and the credential store must match their pre-test
 * checksums when the panel is done.
 *
 * Usage:
 *   node test/roundtrip.mjs <dsh web url>
 */

import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { findChromium } from './chromium.mjs'

const target = process.argv[2]
if (target === undefined) {
  console.error('usage: node test/roundtrip.mjs <dsh web url>')
  process.exit(2)
}

const DSH_HOME = process.env.DSH_HOME ?? join(homedir(), '.dsh')
const PROFILE = process.env.DSH_TEST_PROFILE ?? 'web'
const PATCH = join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml')
const CREDS = join(DSH_HOME, '.credentials.yaml')

/** The dummy key used for the round trip; never a real credential. */
const DUMMY = 'sk-casual-providers-smoke-test-000000000000'

/** md5 of a file, or undefined when it does not exist. */
function digest(path) {
  if (!existsSync(path)) return undefined
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

/**
 * The credential-reference names in the store.
 *
 * This is the right thing to compare, not the file's bytes. The store also holds
 * a `client-connection/browser-session` grant that the harness rotates whenever a
 * browser attaches — this test attaches one — so a byte comparison fails on the
 * harness's own bookkeeping and would hide a real leak in the noise. Refs are the
 * only part this plugin can add, and a leaked ref is the failure that matters.
 *
 * Deliberately a narrow line-based read rather than a YAML parse: the store's
 * own format is strict and fails loud on anything it does not recognise, so a
 * hand-rolled reader cannot quietly agree with a malformed document.
 * @returns the sorted reference names under `refs:`.
 */
function credentialRefs() {
  const text = readFileSync(CREDS, 'utf8')
  const refsAt = text.indexOf('\nrefs:')
  if (refsAt === -1) return []
  const tail = text.slice(refsAt + '\nrefs:'.length)
  return [...tail.matchAll(/^ {2}([A-Za-z_][A-Za-z0-9_]*):/gm)].map(match => match[1]).sort()
}

const patchBefore = digest(PATCH)
/** The patch as it stood before the test touched it, restored at the end. */
const originalPatchText = readFileSync(PATCH, 'utf8')
const refsBefore = credentialRefs()

const executablePath = findChromium()
if (executablePath === undefined) {
  console.log('round-trip check: SKIPPED (no playwright chromium in ~/.cache/ms-playwright)')
  process.exit(0)
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
const page = await browser.newPage()

/** Whether the settings panel is currently on screen. */
async function settingsOpen() {
  return page.getByRole('dialog').count().then(n => n > 0)
    || page.getByText('Settings', { exact: true }).count().then(n => n > 1)
}

/** Open the settings panel, whatever state the shell is in. */
async function openSettings() {
  if (await settingsOpen()) return
  await page.getByRole('button', { name: /settings/i }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
}

/** Open Settings -> Models and wait for the panel to finish its first read. */
async function openModels() {
  await openSettings()
  const configureLater = page.getByRole('button', { name: /configure later/i })
  if (await configureLater.count() > 0) {
    await configureLater.first().click().catch(() => {})
    await page.waitForTimeout(800)
    await openSettings()
  }
  await page.getByText('Models', { exact: true }).first().click({ timeout: 5000 })
  await page.getByText('Quick Setup').first().waitFor({ timeout: 10_000 })
  await page.waitForTimeout(1500)
}

/** Scroll the panel's card into view and return its locator. */
function card(label) {
  return page.locator('li').filter({ hasText: new RegExp(`^${label}`) }).first()
}

try {
  await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 })
  await openModels()

  // ── 1. configure ──────────────────────────────────────────────────────────
  const openai = card('OpenAI')
  await openai.scrollIntoViewIfNeeded()
  const input = openai.locator('input[type="password"]').first()
  await input.fill(DUMMY)
  await openai.getByRole('button', { name: /^Save$/ }).first().click()
  await page.waitForTimeout(2500)

  const patchText = readFileSync(PATCH, 'utf8')
  // Anchored per line. `\s*\n\s+` would swallow across newlines and match a
  // sibling route, which is how the first version of this assertion passed a
  // patch that had no openai row at all.
  assert.match(
    patchText,
    /^ {6}openai:$/m,
    'the profile patch must now carry a route for openai',
  )
  assert.match(
    patchText,
    /^ {8}apiKeyEnv: OPENAI_API_KEY$/m,
    'the route must name the derived credential reference',
  )
  assert.ok(
    !patchText.includes(DUMMY),
    'the key literal must never reach the profile patch',
  )

  const credsText = readFileSync(CREDS, 'utf8')
  assert.match(
    credsText,
    /OPENAI_API_KEY/,
    'the credential store must hold the reference',
  )
  assert.ok(
    credsText.includes(DUMMY),
    'the credential store must hold the literal',
  )
  assert.deepStrictEqual(
    credentialRefs().filter(name => name !== 'OPENAI_API_KEY'),
    refsBefore,
    'saving a key must add exactly one reference and touch nothing else',
  )

  await page.screenshot({ path: 'test/.artifacts/roundtrip-configured.png', fullPage: true }).catch(() => {})

  // ── 1b. an OAuth-only subscription route ──────────────────────────────────
  // Codex is the case with nothing to paste: no key field, no apiKeyEnv, and
  // no browser surface that can start the grant in this release. Adding the
  // route must still be possible, and must still write nothing but a reference-
  // free profile.
  const codex = page.locator('li').filter({ hasText: /^OpenAI Codex/ }).first()
  await codex.scrollIntoViewIfNeeded()
  await codex.getByRole('button', { name: /add route/i }).first().click()
  await page.waitForTimeout(2500)

  const withCodex = readFileSync(PATCH, 'utf8')
  assert.match(
    withCodex,
    /^ {6}openai-codex: \{\}$/m,
    'the Codex route must land as an empty profile — no apiKeyEnv, no baseURL, no models',
  )
  assert.ok(
    !/^ {6}openai-codex:\n {8}\S/m.test(withCodex),
    'an OAuth-only route must never be given any nested field',
  )
  await page.screenshot({ path: 'test/.artifacts/roundtrip-codex.png', fullPage: true }).catch(() => {})

  await codex.scrollIntoViewIfNeeded()
  page.once('dialog', dialog => { dialog.accept() })
  await codex.getByRole('button', { name: /^Remove$/ }).first().click()
  await page.waitForTimeout(2500)
  assert.ok(
    !/openai-codex:/.test(readFileSync(PATCH, 'utf8')),
    'removing the Codex route must remove it again',
  )

  // ── 2. make default ───────────────────────────────────────────────────────
  await openai.scrollIntoViewIfNeeded()
  await openai.getByRole('button', { name: /make default/i }).first().click()
  await page.waitForTimeout(2000)
  assert.match(
    readFileSync(PATCH, 'utf8'),
    /^ {4}provider: openai$/m,
    'the process default must now point at openai',
  )

  // ── 3. remove ─────────────────────────────────────────────────────────────
  await openai.scrollIntoViewIfNeeded()
  page.once('dialog', dialog => { dialog.accept() })
  await openai.getByRole('button', { name: /^Remove$/ }).first().click()
  await page.waitForTimeout(3000)

  // ── 4. the plugin's own footprint is gone ─────────────────────────────────
  const patchAfterRemove = readFileSync(PATCH, 'utf8')
  assert.ok(
    !/^ {6}openai:$/m.test(patchAfterRemove),
    'removing the row must remove the route it wrote',
  )
  assert.ok(
    !patchAfterRemove.includes(DUMMY),
    'the key literal must never reach the profile patch',
  )
  assert.deepStrictEqual(
    credentialRefs(),
    refsBefore,
    'the credential store must hold exactly the references it held before',
  )

  console.log('round-trip check: OK — configured, codex route, defaulted, removed, no trace left')
} finally {
  // Restore the patch unconditionally.
  //
  // This is not belt-and-braces: an assertion failing partway through used to
  // leave a half-configured route in a real profile, because the restore sat at
  // the end of the happy path. The credential store cannot be restored the same
  // way (it holds secrets this test never saw), which is why every step that
  // touches it is ordered so the key is removed before anything can fail.
  if (readFileSync(PATCH, 'utf8') !== originalPatchText) {
    writeFileSync(PATCH, originalPatchText)
  }
  await browser.close()
}

assert.equal(
  digest(PATCH),
  patchBefore,
  'the profile patch must be byte-identical after the round trip',
)
assert.deepStrictEqual(
  credentialRefs(),
  refsBefore,
  'the credential store must hold no reference this test added',
)
assert.ok(
  !readFileSync(CREDS, 'utf8').includes(DUMMY),
  'the dummy key must not survive the round trip',
)
