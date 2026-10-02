/**
 * Ad-hoc probe: dump what one provider row renders and what its buttons do.
 *
 * Usage: node test/probe.mjs <url> [provider label]
 */

import { chromium } from 'playwright-core'
import { findChromium } from './chromium.mjs'

const target = process.argv[2]
const label = process.argv[3] ?? 'OpenAI Codex'
const executablePath = findChromium()
if (executablePath === undefined) {
  console.error('no chromium cached')
  process.exit(2)
}

const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] })
const page = await browser.newPage()
const errors = []
page.on('pageerror', e => errors.push(e.message))
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

const open = async () => {
  if (await page.getByRole('dialog').count() > 0) return
  await page.getByRole('button', { name: /settings/i }).first().click().catch(() => {})
  await page.waitForTimeout(1200)
}
await page.goto(target, { waitUntil: 'networkidle', timeout: 60_000 })
await open()
const later = page.getByRole('button', { name: /configure later/i })
if (await later.count() > 0) { await later.first().click().catch(() => {}); await page.waitForTimeout(800); await open() }
await page.getByText('Models', { exact: true }).first().click({ timeout: 5000 })
await page.getByText('Quick Setup').first().waitFor({ timeout: 10_000 })
await page.waitForTimeout(2000)

const row = page.locator('li').filter({ hasText: new RegExp(`^${label}`) }).first()
console.log(`rows matching ${JSON.stringify(label)}:`, await page.locator('li').filter({ hasText: new RegExp(`^${label}`) }).count())
console.log('row text:', JSON.stringify((await row.textContent())?.slice(0, 400)))
const buttons = await row.getByRole('button').all()
console.log('buttons:', await Promise.all(buttons.map(async b => `${JSON.stringify((await b.textContent())?.trim())} disabled=${await b.isDisabled()}`)))
const inputs = await row.locator('input').count()
console.log('inputs:', inputs)
console.log('links:', await row.locator('a').allTextContents())

await row.scrollIntoViewIfNeeded()
await page.screenshot({ path: 'test/.artifacts/probe.png', fullPage: true }).catch(() => {})
console.log('page errors:', errors.slice(0, 5))
await browser.close()
