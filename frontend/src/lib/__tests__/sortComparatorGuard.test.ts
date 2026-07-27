/**
 * Guards the whole shipped app against comparator-free `Array#sort`.
 *
 * `[].sort()` with no argument does not sort by value. It coerces every element
 * with `String(...)` and compares UTF-16 code units. For the two things this app
 * sorts most that is either silently wrong or right only by accident:
 *
 * - Numbers sort lexicographically, so `[2, 10, 1].sort()` is `[1, 10, 2]`. Every
 *   amount, count, and percentage ranking is wrong, usually in a way that still
 *   looks plausible on screen.
 * - Fixed-width date keys (`YYYY-MM`, `YYYY-MM-DD`) do come out right, because
 *   zero-padded ISO ordering happens to agree with code-unit ordering. That is an
 *   accident of the format, not a property of the call: the next caller to pass a
 *   `M/YYYY`, a `FY 2025-26` label, or a mixed-width key gets a silently wrong
 *   window with no error anywhere.
 *
 * Sonar flags the same thing as `typescript:S2871`, and it gated a PR on exactly
 * one hit in `components/shared/recentIncome.ts` -- where the sorted keys feed a
 * `.slice(-12)` that decides which months count as "recent income", the divisor
 * for the Recurring Coverage ratio. Fixing that one line leaves the rule
 * unenforced, so the rule lives here instead: shipped code always passes a
 * comparator, and `(a, b) => a.localeCompare(b)` is what the ~15 existing
 * date/period sorts in this codebase use.
 *
 * Spec files are excluded, matching the sibling guards. There a bare `.sort()` is
 * idiomatic and safe: every test hit is `[...names].sort()` on a small string
 * array being compared for set equality, where the order only has to be
 * deterministic, and nothing under `__tests__/` ships to a user.
 */

import { describe, expect, it } from 'vitest'

import { appSources, isTestPath } from '@/lib/demo/__tests__/sourceScan'

/** `.sort()` with an empty argument list, whitespace- and newline-tolerant. */
const BARE_SORT = /\.\s*sort\(\s*\)/

/** Comment lines name the banned form on purpose -- this file's own docstring
 *  would otherwise trip the guard, as would every explanatory comment at a fix
 *  site. */
function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

describe('shipped sources vs comparator-free sort', () => {
  it('reads the whole src tree, not one directory', async () => {
    // Without this the assertion below would be vacuously green if the glob broke.
    const shipped = await appSources((path) => !isTestPath(path))
    expect(shipped.length).toBeGreaterThan(400)
    // The file that carried the defect Sonar gated on.
    expect(shipped.some((f) => f.path === '/src/components/shared/recentIncome.ts')).toBe(true)
  })

  it('passes a comparator to every sort in src', async () => {
    const shipped = await appSources((path) => !isTestPath(path))
    const hits: string[] = []
    for (const { path, text } of shipped) {
      text.split('\n').forEach((line, i) => {
        if (isComment(line)) return
        if (BARE_SORT.test(line)) {
          hits.push(
            `${path}:${i + 1} sorts without a comparator -- pass (a, b) => a.localeCompare(b) for keys, or (a, b) => a - b for numbers`,
          )
        }
      })
    }
    expect(hits).toEqual([])
  })

  it('detects the banned forms it claims to detect', () => {
    // A regex guard that matches nothing passes forever.
    const banned = ['keys.sort()', 'rows.map((r) => r.period).sort()', 'a\n      .sort()']
    for (const form of banned) {
      expect(BARE_SORT.test(form), form).toBe(true)
    }
  })

  it('leaves sorts that pass a comparator alone', () => {
    const allowed = [
      'periods.sort((a, b) => a.localeCompare(b))',
      'amounts.sort((a, b) => b - a)',
      '[...rows].sort(byKey)',
      // Not a sort at all, and the substring must not false-positive.
      'const sorted = resort()',
    ]
    for (const form of allowed) {
      expect(BARE_SORT.test(form), form).toBe(false)
    }
  })

  it('is the ordering the fixed call sites actually need', () => {
    // Pins WHY the comparator matters, so the guard is not just a style rule.
    // Code-unit order and locale order agree on fixed-width ISO keys...
    const months = ['2025-10', '2025-02', '2026-01']
    expect([...months].sort((a, b) => a.localeCompare(b))).toEqual([
      '2025-02',
      '2025-10',
      '2026-01',
    ])
    // ...and disagree the moment a key is not zero-padded, which is the case a
    // bare sort would ship as a wrong "recent months" window.
    const ragged = ['2025-9', '2025-10', '2025-2']
    expect([...ragged].sort()).toEqual(['2025-10', '2025-2', '2025-9'])
    // Numbers are the louder failure: lexicographic order is simply not numeric.
    expect([2, 10, 1].map(String).sort()).toEqual(['1', '10', '2'])
  })
})
