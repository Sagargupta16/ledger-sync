import { AxiosHeaders } from 'axios'
import { describe, expect, it } from 'vitest'

/**
 * Pins how a refreshed token replaces the old one on a retried request.
 *
 * By the time the response interceptor runs, `config.headers` is an
 * `AxiosHeaders` instance, and HTTP header names are case-insensitive. The
 * previous code spread it into a plain object and added `Authorization`, which
 * cannot see a differently-cased key already there -- so a request whose header
 * was set as `authorization` would be retried carrying BOTH, and which one the
 * server saw depended on insertion order. The retry would replay the stale
 * token and 401 again.
 *
 * These tests exercise the same `AxiosHeaders.from(...).set(...)` call the
 * client uses, plus the spread it replaced, so the regression is demonstrated
 * rather than asserted.
 */
function withBearer(headers: unknown, token: string): AxiosHeaders {
  return AxiosHeaders.from(headers as never).set('Authorization', `Bearer ${token}`)
}

describe('refreshed-token header swap', () => {
  it('replaces the token and keeps every other header', () => {
    const headers = new AxiosHeaders({
      Authorization: 'Bearer stale',
      'Content-Type': 'application/json',
    })

    const next = withBearer(headers, 'fresh').toJSON()

    expect(next).toEqual({
      Authorization: 'Bearer fresh',
      'Content-Type': 'application/json',
    })
  })

  it('replaces a differently-cased existing header instead of duplicating it', () => {
    const headers = new AxiosHeaders({ authorization: 'Bearer stale' })

    const next = withBearer(headers, 'fresh')

    // One header, the fresh value -- whatever casing it was stored under.
    expect(Object.keys(next.toJSON())).toHaveLength(1)
    expect(next.get('Authorization')).toBe('Bearer fresh')
  })

  it('shows the spread it replaced leaving two Authorization keys behind', () => {
    // The bug, reproduced: a plain-object spread compares keys literally, so a
    // lower-cased `authorization` survives next to the new `Authorization`.
    const headers = new AxiosHeaders({ authorization: 'Bearer stale' })

    // Typed as a bag of unknowns because the point is the key TypeScript does
    // NOT see on the spread result -- the lower-cased one that survives at runtime.
    const spread: Record<string, unknown> = { ...headers, Authorization: 'Bearer fresh' }

    expect(Object.keys(spread).sort()).toEqual(['Authorization', 'authorization'])
    expect(spread.authorization).toBe('Bearer stale')
  })

  it('still attaches the token when the request carried no headers at all', () => {
    expect(withBearer(undefined, 'fresh').get('Authorization')).toBe('Bearer fresh')
  })
})
