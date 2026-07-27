/**
 * Test helper: reads the app's own source text so a guard can assert something
 * about EVERY shipped file instead of the one directory the guard happens to
 * live in.
 *
 * Sources arrive through `import.meta.glob` rather than `node:fs` so this file
 * stays inside the app's TypeScript project, whose `types` is `["vite/client"]`
 * with no `node` entry -- importing `node:fs` here fails `tsc -b`. The glob is
 * root-absolute (`/src/**`) and lazy: eager loading every file as raw text costs
 * ~20s of import time, while awaiting the loaders costs ~2s.
 */

/** Lazy raw-text loaders for every TypeScript source under `src/`, keyed by path. */
const SOURCE_LOADERS = import.meta.glob('/src/**/*.{ts,tsx}', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

export interface SourceFile {
  /** Root-absolute path, e.g. `/src/components/analytics/TopMerchants.tsx`. */
  readonly path: string
  readonly text: string
}

/** True for spec files and test helpers, which run in Node and never ship. */
export function isTestPath(path: string): boolean {
  return path.includes('/__tests__/') || /\.test\.tsx?$/.test(path) || path.startsWith('/src/test/')
}

/**
 * Every source file under `src/`, optionally filtered.
 *
 * Callers must assert the result is non-empty: a glob that stops matching would
 * otherwise make every downstream assertion vacuously true, which is the exact
 * failure mode these guards exist to prevent.
 */
export async function appSources(keep?: (path: string) => boolean): Promise<readonly SourceFile[]> {
  const paths = Object.keys(SOURCE_LOADERS).filter((path) => keep?.(path) ?? true)
  return Promise.all(paths.map(async (path) => ({ path, text: await SOURCE_LOADERS[path]() })))
}

/** Comment lines, blanked in place so reported line numbers stay accurate. */
function stripCommentLines(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const trimmed = line.trimStart()
      return trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*') ? '' : line
    })
    .join('\n')
}

/** Index of the `)` closing the `(` at `open`, or -1 if unbalanced. */
function matchingParen(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1
    else if (text[i] === ')') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** A call site as written, normalised to one line. */
export interface CallForm {
  /** `hookName(args)` with whitespace collapsed, e.g. `useBudgets({ active_only: true })`. */
  readonly form: string
  /** Paths that contain this exact form. */
  readonly paths: readonly string[]
}

/**
 * Every distinct way the app invokes the named hooks, harvested from source
 * text rather than transcribed by hand.
 *
 * This is deliberately textual: the point is to detect a REAL call site changing
 * its arguments. A list of invocations maintained by hand inside a test rots the
 * same way a hardcoded key list does, one level removed.
 *
 * `skip` excludes files that mention a hook without reading it -- the seed
 * module names several in comments, and a seed is not a reader.
 */
export async function hookCallForms(
  hooks: readonly string[],
  skip: (path: string) => boolean = isTestPath,
): Promise<readonly CallForm[]> {
  const sources = await appSources((path) => !skip(path))
  if (sources.length === 0) throw new Error('hookCallForms: no sources matched -- the glob is broken')

  const found = new Map<string, Set<string>>()
  for (const { path, text } of sources) {
    const code = stripCommentLines(text)
    for (const hook of hooks) {
      let cursor = 0
      for (;;) {
        const start = code.indexOf(`${hook}(`, cursor)
        if (start === -1) break
        // Reject `useFooBar(` / `service.useFoo(` matching `useFoo(`.
        const prev = start === 0 ? '' : code[start - 1]
        if (/[A-Za-z0-9_$.]/.test(prev)) {
          cursor = start + 1
          continue
        }
        // Reject the declaration itself: `export function useFoo(params?: X)`
        // is where the hook is defined, not a place that reads it. Arrow-form
        // declarations (`const useFoo = (...) =>`) never match this pattern.
        if (/\bfunction\s+$/.test(code.slice(Math.max(0, start - 24), start))) {
          cursor = start + 1
          continue
        }
        const open = start + hook.length
        const close = matchingParen(code, open)
        if (close === -1) break
        const args = code.slice(open + 1, close).trim().replace(/\s+/g, ' ')
        const form = `${hook}(${args})`
        const paths = found.get(form) ?? new Set<string>()
        paths.add(path)
        found.set(form, paths)
        cursor = close
      }
    }
  }

  return [...found]
    .map(([form, paths]) => ({ form, paths: [...paths].sort() }))
    .sort((a, b) => a.form.localeCompare(b.form))
}
