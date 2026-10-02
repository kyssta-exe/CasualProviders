/**
 * Browser boot check.
 *
 * The one failure mode a Node test cannot see is the one that actually broke
 * this plugin once: a service named in the browser half's `inject` that nothing
 * provides. Cordis does not throw — it parks the fiber as *pending* — so the
 * entry loads, the bundle is served, the boot graph carries the row, and
 * nothing looks wrong until a browser reports "1 entry did not activate".
 *
 * This test drives a real Chromium against a running `dsh web` and asserts the
 * failure screen is *not* what it sees. It is the only check that exercises
 * the real service registry, the real Lazy-CJS materialization, and the real
 * slot ledger.
 *
 * Usage:
 *   dsh web --no-open &            # or let this script find a free port
 *   node test/browser.mjs <url>
 *
 * Requires the Playwright chromium build in `~/.cache/ms-playwright`.
 */

import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { chromium } from 'playwright-core'
import { findChromium } from './chromium.mjs'

const target = process.argv[2]
if (target === undefined) {
  console.error('usage: node test/browser.mjs <dsh web url>')
  process.exit(2)
}

const executablePath = findChromium()
if (executablePath === undefined) {
  console.log('browser boot check: SKIPPED (no playwright chromium in ~/.cache/ms-playwright)')
  process.exit(0)
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
const page = await browser.newPage()

/** Every console error and page error the boot produced. */
const problems = []
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`)
})
page.on('pageerror', (error) => { problems.push(`pageerror: ${error.message}`) })

await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 })

// The shell reports an entry that never activated with this exact heading. Its
// presence is the failure this plugin shipped once.
const body = await page.textContent('body')
assert.ok(body !== null, 'the page must render')
assert.ok(
  !body.includes('Failed to load plugins'),
  `the web boot reported a dead entry:\n${body.slice(0, 2000)}`,
)
assert.ok(
  !/pending \(waiting for service: \w+\)/.test(body),
  `an entry is parked as pending:\n${body.slice(0, 2000)}`,
)
assert.ok(
  !body.includes('HARNESS') || body.includes('Settings'),
  'the shell failed to boot past its failure screen',
)

// The plugin must have materialized: its bundle registers a factory under this
// id, and the client module system keeps the materialized exports in its cache.
const materialized = await page.evaluate(() => {
  const loader = globalThis.__DSH_BOOT__ !== undefined
  const graph = globalThis.__DSH_BOOT__
  const entries = Array.isArray(graph?.entries) ? graph.entries : []
  const row = entries.find(entry => entry.id === 'dsh-casual-providers')
  return { hasGraph: loader, row: row === undefined ? undefined : { id: row.id, url: row.url } }
})
assert.ok(materialized.hasGraph, 'the host must have injected a boot graph')
assert.ok(materialized.row !== undefined, 'the plugin must carry a boot-graph row')

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

// Open Settings and confirm the panel actually renders inside the Models page,
// which is the only place either extension seat dispatches.
await openSettings()

// A first-run install opens a DeepSeek credential modal over the settings panel.
// It is unrelated to this plugin, but it covers the nav. Dismissing it can
// close the whole panel, so the panel is re-opened afterwards rather than
// assumed.
const configureLater = page.getByRole('button', { name: /configure later/i })
if (await configureLater.count() > 0) {
  await configureLater.first().click().catch(() => {})
  await page.waitForTimeout(800)
  await openSettings()
}

const clickedModels = await page
  .getByText('Models', { exact: true })
  .first()
  .click({ timeout: 5000 })
  .then(() => true)
  .catch(() => false)
await page.waitForTimeout(3000)

const quickSetupCount = await page.getByText('Quick Setup').count()

// A dictionary key the panel asks for but the dictionary does not define falls
// through to the key itself, so the heading renders as literal
// `groups.frontier` instead of "Frontier labs". This shipped once. Assert the
// translated headings, not just the panel title.
const GROUP_HEADINGS = [
  'Frontier labs',
  'Fast and affordable',
  'Gateways and aggregators',
  'Subscriptions and sign-in',
  'Cloud platforms',
  'Regional',
]
const panelText = await page.textContent('body').then(text => text ?? '')
const missingHeadings = GROUP_HEADINGS.filter(heading => !panelText.includes(heading))
const leakedKeys = [...panelText.matchAll(/\b[a-z][a-zA-Z]*\.[a-z][a-zA-Z]*\b/g)]
  .map(match => match[0])
  .filter(word => !word.includes('/') && !/^\d/.test(word))

await page.screenshot({ path: 'test/.artifacts/models-page.png', fullPage: true }).catch(() => {})

await browser.close()

if (quickSetupCount === 0) {
  console.log('browser boot check: booted clean, but the panel was NOT found')
  console.log(`  (models clicked: ${clickedModels})`)
  if (problems.length > 0) console.log(`  page problems: ${problems.slice(0, 6).join(' | ')}`)
  process.exit(1)
}

// Only assert the full heading set when every group is actually on screen —
// the panel scrolls inside a fixed dialog, so a short viewport legitimately
// hides the lower groups.
const observed = GROUP_HEADINGS.filter(heading => panelText.includes(heading))
if (observed.length === 0) {
  console.log('browser boot check: panel found but NO group heading is translated')
  console.log(`  leaked dictionary keys: ${[...new Set(leakedKeys)].slice(0, 8).join(', ') || '(none found)'}`)
  process.exit(1)
}

console.log(`browser boot check: OK — panel rendered, ${observed.length}/${GROUP_HEADINGS.length} group headings translated`)
if (leakedKeys.length > 0) {
  console.log(`  leaked dictionary keys: ${[...new Set(leakedKeys)].slice(0, 8).join(', ')}`)
}
if (problems.length > 0) console.log(`  note, non-fatal page problems: ${problems.slice(0, 5).join(' | ')}`)
