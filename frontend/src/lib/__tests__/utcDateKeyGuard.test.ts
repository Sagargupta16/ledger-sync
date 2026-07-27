/**
 * Guards the whole shipped app against UTC-derived date KEYS.
 *
 * `new Date(...).toISOString()` is a UTC reprojection, not a serialisation.
 * Truncating it to a `YYYY-MM-DD` (or `YYYY-MM`) key therefore answers "what day
 * is it in Greenwich", which is not the question anywhere in this app: ledger
 * rows are stored at local midnight, the backend parses a bare `YYYY-MM-DD` as
 * naive, and every filter/bucket/label is a local calendar day. In IST
 * (UTC+5:30) the two disagree for the first 5.5 hours of every day, and for a
 * Date built from local components (`new Date(y, m, 1)`) they disagree ALWAYS --
 * local 1 August serialises as `2025-07-31T18:30:00.000Z`.
 *
 * This has been fixed one call site at a time repeatedly (budget presets, heatmap
 * keys, tax planning, net-worth trend, investment day stepping, demo recurring /
 * goals / RSU vests). A per-site fix does not stop the next one, so the rule
 * lives here: truncating `toISOString()` to a date key is banned tree-wide, and
 * `toLocalDateKey` / `getTodayKey` / `getCurrentMonth` from `@/lib/dateUtils` are
 * the replacements.
 *
 * A FULL `toISOString()` -- an instant, no truncation -- is still fine and stays
 * allowed: `created_at`, `last_import_at`, `next_reset_utc` and friends are
 * genuine UTC timestamps.
 */

import { describe, expect, it } from 'vitest'

import { appSources, isTestPath } from '@/lib/demo/__tests__/sourceScan'

/**
 * A truncated `toISOString()`: `.slice(0, 10)`, `.substring(0, 10)`,
 * `.split('T')[0]`, `.slice(0, 7)`. Whitespace-tolerant so a formatter line
 * break cannot hide a hit.
 */
const TRUNCATED_ISO =
  /toISOString\(\)\s*(?:\.\s*slice\(\s*0\s*,\s*(?:7|10)\s*\)|\.\s*substring\(\s*0\s*,\s*(?:7|10)\s*\)|\.\s*split\(\s*['"`]T['"`]\s*\)\s*\[\s*0\s*\])/

/** Comment lines name the banned form on purpose -- every docstring explaining
 *  the bug would otherwise trip the guard. */
function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

describe('shipped sources vs UTC date keys', () => {
  it('reads the whole src tree, not one directory', async () => {
    // Without this the assertion below would be vacuously green if the glob broke.
    const shipped = await appSources((path) => !isTestPath(path))
    expect(shipped.length).toBeGreaterThan(400)
    // Two files that previously carried the defect, one per stack half.
    expect(shipped.some((f) => f.path === '/src/pages/budget/budgetUtils.ts')).toBe(true)
    expect(shipped.some((f) => f.path === '/src/lib/demo/demoAnalyticsV2.ts')).toBe(true)
  })

  it('derives no date key from toISOString anywhere in src', async () => {
    const shipped = await appSources((path) => !isTestPath(path))
    const hits: string[] = []
    for (const { path, text } of shipped) {
      text.split('\n').forEach((line, i) => {
        if (isComment(line)) return
        if (TRUNCATED_ISO.test(line)) {
          hits.push(
            `${path}:${i + 1} truncates toISOString() to a date key -- use toLocalDateKey/getTodayKey from @/lib/dateUtils`,
          )
        }
      })
    }
    expect(hits).toEqual([])
  })

  it('detects the banned forms it claims to detect', () => {
    // A regex guard that matches nothing passes forever. Pin it against each
    // spelling, including the ones a formatter may wrap.
    const banned = [
      "new Date().toISOString().slice(0, 10)",
      "d.toISOString().substring(0, 10)",
      "new Date().toISOString().split('T')[0]",
      'now.toISOString().split("T")[0]',
      "d.toISOString().slice(0, 7)",
      "d.toISOString()\n        .slice(0, 10)".replace('\n        ', ' '),
    ]
    for (const form of banned) {
      expect(TRUNCATED_ISO.test(form), form).toBe(true)
    }
  })

  it('leaves full UTC instants alone', () => {
    // These are real timestamps, not calendar keys, and must keep passing.
    const allowed = [
      'created_at: new Date().toISOString(),',
      'next_reset_utc: nextReset.toISOString(),',
      'return new Date(data.fetched_at * 1000).toISOString()',
    ]
    for (const form of allowed) {
      expect(TRUNCATED_ISO.test(form), form).toBe(false)
    }
  })
})
