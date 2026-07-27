import { describe, expect, it } from 'vitest'

/**
 * Guards the FastAPI silent-drop bug class for the analytics client.
 *
 * FastAPI ignores a query param its handler does not declare: no 422, no
 * warning, HTTP 200 with the param discarded. So a call that sends a param the
 * endpoint never heard of compiles, type-checks, passes review because it reads
 * like a contract, and does nothing. It has shipped twice in this repo:
 *
 *  - `GET /api/transactions/export` was sent every table filter the user had
 *    set, while the handler declared none, so the CSV was always the whole
 *    ledger.
 *  - `analyticsService.getRecentTransactions` sent `sort: 'date'` and
 *    `sort_order: 'desc'` to `GET /api/transactions`, which declares neither
 *    (and whose sibling `/api/transactions/search` spells the real ones
 *    `sort_by` / `sort_order`). The ordering it looked like it was requesting
 *    came from a hardcoded `order_by` in the handler -- so the params were dead
 *    weight that documented a contract the endpoint did not have.
 *
 * `model_config = {"extra": "forbid"}` on the live endpoints is not an option:
 * the already-deployed GitHub Pages frontend sends extra params today and would
 * start getting 422s from a backend it did not ship with. So the guard lives
 * here, in the test suite, where a re-added param fails before it deploys.
 *
 * The frontend half is MECHANICAL -- the params are parsed out of
 * `services/api/analytics.ts` itself, so this cannot fall behind the client. The
 * backend half is hardcoded below with a citation, because Vite's dev server
 * refuses to serve files outside the frontend root ("Denied ID
 * .../backend/src/ledger_sync/api/analytics.py?raw"), so a test cannot read the
 * Python source. Re-verify the citations when a signature changes.
 */

const CLIENT_SOURCE = import.meta.glob('/src/services/api/analytics.ts', {
  query: '?raw',
  import: 'default',
}) as Record<string, () => Promise<string>>

/**
 * Query params each endpoint's handler actually declares.
 *
 * Read off the handler signatures on 2026-07-27. Cited by FUNCTION NAME, not by
 * line: `analytics.py` was being edited while this was written and every line
 * number in it moved, which is exactly how a citation rots into a lie.
 *
 *  - `/api/analytics/kpis` -> `get_kpis` in
 *    `backend/src/ledger_sync/api/analytics.py`
 *  - `/api/analytics/overview` -> `get_overview`, same file
 *  - `/api/analytics/behavior` -> `get_behavior`, same file
 *  - `/api/analytics/trends` -> `get_trends`, same file
 *    (all four declare exactly one param, `time_range`, defaulted to
 *    `TimeRange.ALL_TIME`; none takes a date window)
 *  - `/api/transactions` -> `get_transactions`,
 *    `backend/src/ledger_sync/api/transactions.py:328-336`. Ordering is NOT a
 *    param: line 359 is a hardcoded
 *    `query.order_by(Transaction.date.desc())`. The endpoint that does sort is
 *    `GET /api/transactions/search` (`sort_by` / `sort_order`, same file, lines
 *    501-515), which this client does not call.
 */
const DECLARED_PARAMS: Readonly<Record<string, readonly string[]>> = {
  '/api/analytics/kpis': ['time_range'],
  '/api/analytics/overview': ['time_range'],
  '/api/analytics/behavior': ['time_range'],
  '/api/analytics/trends': ['time_range'],
  '/api/transactions': ['start_date', 'end_date', 'limit', 'offset'],
}

interface ClientCall {
  /** Service method name, e.g. `getRecentTransactions`. */
  readonly method: string
  /** The URL literal passed to `apiClient.get`. */
  readonly url: string
  /** Query param names the method sends. */
  readonly params: readonly string[]
}

/** Index of the `}` closing the `{` at `open`, or -1 if unbalanced. */
function matchingBrace(text: string, open: number): number {
  let depth = 0
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '{') depth += 1
    else if (text[i] === '}') {
      depth -= 1
      if (depth === 0) return i
    }
  }
  return -1
}

/** Split on commas that are not nested inside braces, brackets or parens. */
function topLevelSplit(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i]
    if (ch === '{' || ch === '[' || ch === '(') depth += 1
    else if (ch === '}' || ch === ']' || ch === ')') depth -= 1
    else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts.map((p) => p.trim()).filter(Boolean)
}

/** Property names of an object-literal or type-literal body. */
function keysOf(body: string): string[] {
  return topLevelSplit(body.replaceAll(';', ','))
    .map((entry) => entry.split(':')[0].trim().replace(/\?$/, ''))
    .filter((name) => /^[A-Za-z_$][\w$]*$/.test(name))
}

/**
 * Every `apiClient.get` in the analytics client, with the params it sends.
 *
 * Two forms appear and both are handled: an inline `params: { ... }` object, and
 * a pass-through `{ params }` whose keys come from the method's own parameter
 * type annotation (`getKPIs(params?: { time_range?: TimeRange })`). A
 * pass-through resolved from the signature is exactly as strong as the inline
 * form here, because the signature is what a caller is allowed to fill in.
 */
function clientCalls(source: string): ClientCall[] {
  const calls: ClientCall[] = []
  // `name: async (args)` -- optionally followed by a return annotation.
  const METHOD = /^ {2}(\w+): async \(([^)]*)\)/gm
  const starts = [...source.matchAll(METHOD)]

  for (const [index, match] of starts.entries()) {
    const from = match.index
    const to = starts[index + 1]?.index ?? source.length
    const slice = source.slice(from, to)

    const getAt = slice.indexOf('apiClient.get')
    if (getAt === -1) continue
    const url = /'([^']+)'/.exec(slice.slice(getAt))?.[1] ?? ''

    const inline = /params:\s*\{/.exec(slice)
    if (inline) {
      const open = slice.indexOf('{', inline.index + 'params:'.length)
      const close = matchingBrace(slice, open)
      calls.push({ method: match[1], url, params: keysOf(slice.slice(open + 1, close)) })
      continue
    }

    // `{ params }` shorthand -- resolve from the signature's type literal.
    if (/\bparams\s*[,}]/.test(slice.slice(getAt))) {
      const sigOpen = match[2].indexOf('{')
      const sigBody =
        sigOpen === -1 ? '' : match[2].slice(sigOpen + 1, matchingBrace(match[2], sigOpen))
      calls.push({ method: match[1], url, params: keysOf(sigBody) })
      continue
    }

    calls.push({ method: match[1], url, params: [] })
  }
  return calls
}

async function analyticsClientSource(): Promise<string> {
  const paths = Object.keys(CLIENT_SOURCE)
  expect(paths, 'the source glob stopped matching -- every assertion below would be vacuous').toEqual(
    ['/src/services/api/analytics.ts'],
  )
  return CLIENT_SOURCE[paths[0]]()
}

describe('analytics client param contract', () => {
  it('parses every apiClient.get in the client, so the guard is not vacuous', async () => {
    const source = await analyticsClientSource()
    const calls = clientCalls(source)

    // One parsed call per `apiClient.get` in the file: if the parser silently
    // skips a method, that method's params go unchecked.
    expect(calls.length).toBe(source.match(/apiClient\.get/g)?.length ?? 0)
    expect(calls.length).toBeGreaterThan(0)
    // And every one resolved a URL, otherwise the endpoint lookup below matches
    // nothing and passes for the wrong reason.
    expect(calls.filter((c) => c.url === '')).toEqual([])
  })

  it('sends only params the endpoint declares', async () => {
    const calls = clientCalls(await analyticsClientSource())

    const undeclared = calls.flatMap(({ method, url, params }) => {
      const declared = DECLARED_PARAMS[url]
      if (!declared) return []
      return params
        .filter((param) => !declared.includes(param))
        .map(
          (param) =>
            `${method} sends '${param}' to ${url}, which declares only [${declared.join(', ')}] -- FastAPI will drop it silently`,
        )
    })

    expect(undeclared).toEqual([])
  })

  it('has a declared param set for every endpoint the client calls', async () => {
    // The other direction. A new method aimed at an endpoint nobody has checked
    // would otherwise skip the assertion above entirely.
    const calls = clientCalls(await analyticsClientSource())
    const unknown = calls
      .filter(({ url }) => !DECLARED_PARAMS[url])
      .map(({ method, url }) => `${method} -> ${url} (add it to DECLARED_PARAMS with a citation)`)

    expect(unknown).toEqual([])
  })

  it('keeps a DECLARED_PARAMS entry for every endpoint, none stale', async () => {
    const calls = clientCalls(await analyticsClientSource())
    const called = new Set(calls.map((c) => c.url))
    // A citation for an endpoint the client no longer touches is a claim nothing
    // verifies, which is how the dead chart methods rotted in the first place.
    expect(Object.keys(DECLARED_PARAMS).filter((url) => !called.has(url))).toEqual([])
  })

  it('asks /api/transactions for nothing but a page size', async () => {
    // The specific regression: `sort` and `sort_order` here read as a sort
    // contract the endpoint does not have. Newest-first comes from the handler's
    // own `order_by(Transaction.date.desc())`.
    const call = clientCalls(await analyticsClientSource()).find(
      (c) => c.method === 'getRecentTransactions',
    )

    expect(call?.url).toBe('/api/transactions')
    expect(call?.params).toEqual(['limit'])
  })

  it('types the KPI params as time_range, not a date window', async () => {
    // `{ start_date, end_date }` type-checked and was dropped on the wire, so a
    // date-filtered KPI read silently answered with all-time figures.
    const call = clientCalls(await analyticsClientSource()).find((c) => c.method === 'getKPIs')

    expect(call?.url).toBe('/api/analytics/kpis')
    expect(call?.params).toEqual(['time_range'])
  })
})
