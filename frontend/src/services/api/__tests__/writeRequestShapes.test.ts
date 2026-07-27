import { describe, expect, it } from 'vitest'

/**
 * Guards the null-body-plus-query-params bug class, which shipped twice and
 * broke two user-facing features outright.
 *
 * FastAPI decides where a field comes from by its handler signature: a Pydantic
 * model parameter is a required JSON body, an `Annotated[..., Query()]` is a
 * query param. Sending the wrong one gets a flat 422 with
 * `{"loc": ["body"], "msg": "Field required"}` -- so the call compiles, the
 * types check, and the button just never works:
 *
 *  - `POST /api/analytics/v2/anomalies/{id}/review` declares
 *    `body: ReviewAnomalyRequest`. The service posted `null` with
 *    `params: { dismiss, notes }`, so every Review and Dismiss click on
 *    `/anomalies` 422'd. Reproduced 2026-07-27; pinned in
 *    `backend/tests/integration/test_anomaly_review.py`.
 *  - `PUT /api/auth/me` declares `updates: UserUpdate`. The service put `null`
 *    with `params: { full_name }`, so saving a display name in the profile modal
 *    422'd. Pinned in `backend/tests/integration/test_profile_update.py`.
 *
 * Neither was caught by tsc (the request config is structurally valid either
 * way) or by the demo tests (demo mode rejects all mutations before the wire).
 * So this test reads the SOURCE and enumerates every write call that passes a
 * null/absent body alongside query params, checking each against an explicit
 * allowlist of endpoints whose handlers genuinely take query params.
 */

const WRITE_SOURCES = import.meta.glob('../*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * Endpoints whose backend handler really does declare query parameters, so a
 * null body is correct. Verified against the live OpenAPI schema on 2026-07-27:
 *
 *  - `POST /api/auth/account/reset` -> `mode: Annotated[Literal[...], Query()]`
 *  - `POST /api/analytics/v2/refresh` -> no body and no params; the null is just
 *    a positional placeholder so the axios config (a longer timeout) can be
 *    passed as the third argument.
 *  - `POST /api/account-classifications` -> `account_name` / `account_type`,
 *    both `Query()`. It builds its query string into the URL rather than
 *    passing `params`, so it does not match the detector below at all; listed
 *    here for the reader.
 */
const QUERY_PARAM_ENDPOINTS = [
  '/account/reset',
  '/api/analytics/v2/refresh',
  '/api/account-classifications',
] as const

/**
 * A write call that passes `null` (or `undefined`) as its body argument.
 *
 * Deliberately matches the BODY ARGUMENT rather than searching for `params:`,
 * because the defect is the null body -- a call with a real body plus params is
 * legitimate (path filters on a PUT, say).
 */
const NULL_BODY_WRITE = /apiClient\.(post|put|patch)(?:<[^>]*>)?\(\s*([^,]+),\s*(null|undefined)\s*,/g

interface NullBodyWrite {
  file: string
  method: string
  target: string
}

function findNullBodyWrites(): NullBodyWrite[] {
  const found: NullBodyWrite[] = []
  for (const [path, source] of Object.entries(WRITE_SOURCES)) {
    // Normalise the template-literal / concatenated URL down to something
    // matchable: only the literal segments matter for the allowlist.
    for (const match of source.matchAll(NULL_BODY_WRITE)) {
      found.push({ file: path, method: match[1], target: match[2].trim() })
    }
  }
  return found
}

describe('write request shapes', () => {
  it('finds the null-body write calls at all, so the detector is not vacuous', () => {
    // If this drops to zero, the regex has stopped matching the codebase and
    // every assertion below would pass for the wrong reason.
    expect(findNullBodyWrites().length).toBeGreaterThan(0)
  })

  it('passes a null body only to endpoints whose handler takes query params', () => {
    const offenders = findNullBodyWrites().filter(
      (w) => !QUERY_PARAM_ENDPOINTS.some((allowed) => w.target.includes(allowed)),
    )

    expect(
      offenders.map((o) => `${o.method.toUpperCase()} ${o.target} (${o.file})`),
    ).toEqual([])
  })

  /**
   * Slice the source from a function name to the end of its first `apiClient.*`
   * call. Whitespace-insensitive on purpose -- the first attempt at this matched
   * the exact indentation and broke the moment the formatter reflowed the call.
   */
  function callBody(source: string, fnName: string): string {
    const start = source.indexOf(fnName)
    expect(start, `${fnName} not found in source`).toBeGreaterThan(-1)
    const callStart = source.indexOf('apiClient.', start)
    expect(callStart, `no apiClient call after ${fnName}`).toBeGreaterThan(-1)
    // Balance parens from the call's own `(` so the slice stops at THIS
    // statement. A line-based sentinel ran past the function and picked up the
    // next one's `params:` (resetAccount's, which is legitimate).
    const open = source.indexOf('(', callStart)
    let depth = 0
    for (let i = open; i < source.length; i++) {
      if (source[i] === '(') depth++
      else if (source[i] === ')') {
        depth--
        if (depth === 0) return source.slice(callStart, i + 1)
      }
    }
    throw new Error(`unbalanced parens in the ${fnName} call`)
  }

  it('sends the anomaly review payload as a body, not query params', () => {
    const call = callBody(WRITE_SOURCES['../analyticsV2.ts'], 'async reviewAnomaly')
    // `data` is the second positional argument, which is where axios puts a body.
    expect(call.replace(/\s+/g, ' ')).toContain('review`, data,')
    expect(call).not.toContain('params:')
  })

  it('sends the profile name as a body, not query params', () => {
    const call = callBody(WRITE_SOURCES['../auth.ts'], 'export const updateProfile')
    expect(call.replace(/\s+/g, ' ')).toContain('{ full_name: fullName }')
    expect(call).not.toContain('params:')
  })
})
