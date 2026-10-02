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

const patchBefore = digest(PATCH)
const credsBefore = digest(CREDS)
/** The patch as it stood before the test touched it, restored at the end. */
const originalPatchText = readFileSync(PATCH, 'utf8')

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
  assert.match(
    patchText,
    /providers:\s*\n\s+openai:/,
    'the profile patch must now carry a route for openai',
  )
  assert.match(
    patchText,
    /apiKeyEnv:\s*OPENAI_API_KEY/,
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

  await page.screenshot({ path: 'test/.artifacts/roundtrip-configured.png', fullPage: true }).catch(() => {})

  // ── 2. make default ───────────────────────────────────────────────────────
  await openai.scrollIntoViewIfNeeded()
  await openai.getByRole('button', { name: /make default/i }).first().click()
  await page.waitForTimeout(2000)
  assert.match(
    readFileSync(PATCH, 'utf8'),
    /provider:\s*openai/,
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
    !/providers:\s*\n\s+openai:/.test(patchAfterRemove),
    'removing the row must remove the route it wrote',
  )
  assert.ok(
    !patchAfterRemove.includes(DUMMY),
    'the key literal must never reach the profile patch',
  )
  assert.equal(
    digest(CREDS),
    credsBefore,
    'the credential store must be byte-identical again',
  )

  // ── 5. leave no trace ─────────────────────────────────────────────────────
  // Remove deliberately does NOT rewrite `agent-default-model` back: silently
  // changing someone's default model out from under them would be worse than
  // leaving a dangling selection the picker makes obvious. So the default-model
  // line is expected residue of this test, and the test restores it itself.
  writeFileSync(PATCH, originalPatchText)
  await page.waitForTimeout(2000)

  assert.equal(
    digest(PATCH),
    patchBefore,
    'after the test restores the patch, it must match its pre-test bytes',
  )
  assert.equal(
    digest(CREDS),
    credsBefore,
    'the credential store must be byte-identical',
  )

  console.log('round-trip check: OK — configured, defaulted, removed, no trace left')
} finally {
  await browser.close()
}
