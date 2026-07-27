/**
 * Guards the whole shipped app against built-ins newer than the build target.
 *
 * Vite 8's default `build.target` is `baseline-widely-available`, which resolves
 * to `['chrome111','edge111','firefox114','safari16.4','ios16.4']` (verified in
 * `node_modules/vite/dist/node/chunks/node.js`:
 * `ESBUILD_BASELINE_WIDELY_AVAILABLE_TARGET`). Vite lowers SYNTAX to that target
 * but never injects method polyfills, and this repo has no core-js import and no
 * `@vitejs/plugin-legacy`. So a built-in METHOD whose engine floor sits above any
 * target entry ships as-is and is `undefined` at runtime for that browser -- a
 * TypeError, not a graceful degradation.
 *
 * `Array#toSorted`/`toReversed`/`toSpliced` are exactly that case: they need
 * Firefox 115, one version above the target. `at`, `findLast`, `findLastIndex`,
 * `Object.hasOwn` and `flat` are all comfortably below it and stay allowed.
 *
 * Scope is EVERY `src/**` file that ships, not one directory. A previous version
 * of this guard globbed `../*.ts` (i.e. `src/lib/demo` only) and passed green
 * while `components/analytics/TopMerchants.tsx` shipped `.toSorted(` into
 * `dist/`. Spec files are excluded because they run in Node, never in a browser.
 */

import { describe, expect, it } from 'vitest'

import { appSources, isTestPath } from './sourceScan'

/**
 * Methods that ship unpolyfilled past the target, each with the supported form
 * to use instead. Floors cross-checked against core-js-compat 3.49.0 data
 * (`es.array.to-sorted` -> firefox 115) versus the firefox114 target entry.
 */
const FORBIDDEN: ReadonlyArray<{ readonly method: string; readonly use: string }> = [
  { method: 'toSorted', use: '[...arr].sort(...)' },
  { method: 'toReversed', use: '[...arr].reverse()' },
  { method: 'toSpliced', use: 'arr.slice(...) composition' },
]

/** Comment lines name the forbidden methods on purpose. */
function isComment(line: string): boolean {
  const trimmed = line.trimStart()
  return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')
}

describe('shipped sources vs build target', () => {
  it('reads the whole src tree, not one directory', async () => {
    // Without this, a bad glob would make the assertion below vacuous -- and a
    // too-narrow glob is precisely how the TopMerchants hit escaped.
    const shipped = await appSources((path) => !isTestPath(path))
    expect(shipped.length).toBeGreaterThan(400)
    // The file that the old `src/lib/demo`-only glob could not see.
    expect(shipped.some((f) => f.path === '/src/components/analytics/TopMerchants.tsx')).toBe(true)
  })

  it('uses no array method newer than firefox114 anywhere in src', async () => {
    const shipped = await appSources((path) => !isTestPath(path))
    const hits: string[] = []
    for (const { path, text } of shipped) {
      text.split('\n').forEach((line, i) => {
        if (isComment(line)) return
        for (const { method, use } of FORBIDDEN) {
          if (line.includes(`.${method}(`)) {
            hits.push(`${path}:${i + 1} uses .${method}() -- use ${use}`)
          }
        }
      })
    }
    expect(hits).toEqual([])
  })

  it('agrees with the spread-then-sort equivalence it relies on', () => {
    // The replacement is only safe because Array#sort has been required-stable
    // since ES2019 and the spread makes a fresh array, so equal keys keep
    // insertion order and the source is never mutated -- same as toSorted.
    const rows = [
      { k: 1, tag: 'a' },
      { k: 0, tag: 'b' },
      { k: 1, tag: 'c' },
      { k: 0, tag: 'd' },
    ]
    const frozenSnapshot = JSON.stringify(rows)
    const byKey = (a: { k: number }, b: { k: number }) => a.k - b.k

    const spread = [...rows].sort(byKey)
    expect(spread.map((r) => r.tag)).toEqual(['b', 'd', 'a', 'c'])
    expect(spread).toEqual(rows.toSorted(byKey))
    // Source untouched by either form.
    expect(JSON.stringify(rows)).toBe(frozenSnapshot)
    // And the empty case, which is why the old `rows.length ?` guard was dead.
    expect([...[]].sort(byKey)).toEqual([])
  })
})
