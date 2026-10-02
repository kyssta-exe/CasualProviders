/**
 * Locate the cached Playwright chromium build.
 *
 * The machine's cache holds whatever revision was installed for some other
 * playwright version, which is often not the one `playwright-core` expects —
 * and its default headless-shell path is versioned too, so a mismatch throws
 * before a single line of the test runs. Walking the cache for a real chrome
 * binary sidesteps both.
 */

import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

/**
 * @returns the path to a usable chromium binary, or undefined when none is
 * cached — in which case a caller should skip rather than fail.
 */
export function findChromium() {
  const root = join(homedir(), '.cache', 'ms-playwright')
  if (!existsSync(root)) return undefined
  const builds = readdirSync(root).filter(entry => entry.startsWith('chromium-')).reverse()
  for (const build of builds) {
    for (const candidate of [
      join(root, build, 'chrome-linux64', 'chrome'),
      join(root, build, 'chrome-linux', 'chrome'),
    ]) {
      if (existsSync(candidate)) return candidate
    }
  }
  return undefined
}
