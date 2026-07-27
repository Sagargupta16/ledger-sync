import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Guards the demo-route bug class, which has now shipped twice.
 *
 * `client.ts` resolves demo GETs through an ORDERED table where the first URL
 * SUBSTRING match wins, and it ends in catch-alls. So a route that is missing,
 * or listed after a broader prefix, silently resolves to the wrong SHAPE rather
 * than failing loudly:
 *
 *  - `/analytics/v2/data-health` fell through to `['/analytics/v2/', ...]`, which
 *    answers `{ data: [], count: 0 }`. The page's validator rejected it and the
 *    query never settled, so Data Health hung forever.
 *  - `/account-classifications/type/{type}` fell through to
 *    `['/account-classifications', ...]`, which answers a name -> classification
 *    MAP instead of `{ accounts: [...] }`. The SIP projection page then called
 *    `.includes()` on `undefined` and dropped to its error boundary.
 *
 * Both were invisible to type-checking: the resolvers are typed `unknown`.
 * These tests pin the shape each caller actually destructures, and pin the
 * ORDERING that makes the specific routes reachable at all.
 */

vi.mock('@/store/demoStore', () => ({ isDemoMode: () => true }))

const { getDemoTransactions } = await import('@/lib/demo/seedDemoCache')
const { apiClient } = await import('../client')

/** Drive a GET through the real demo interceptor and hand back the payload. */
async function demoGet(url: string): Promise<unknown> {
  const response = await apiClient.get(url)
  return response.data
}

describe('demo route shapes', () => {
  beforeEach(() => {
    // The adapter reads the seeded demo ledger; an empty cache is still a valid
    // input here because these tests assert SHAPE, not row counts.
    getDemoTransactions()
  })

  it('serves data-health as a bare object carrying the four quality counts', async () => {
    const payload = (await demoGet('/api/analytics/v2/data-health')) as Record<string, unknown>

    // Not a list envelope -- that is precisely the regression.
    expect(Array.isArray(payload)).toBe(false)
    expect(payload).not.toHaveProperty('count')

    for (const field of [
      'transaction_count',
      'future_dated_count',
      'placeholder_note_count',
      'uncategorized_count',
    ]) {
      expect(typeof payload[field], `${field} must be a number`).toBe('number')
    }
  })

  it('serves account-classifications/type as { accounts: string[] }', async () => {
    const payload = (await demoGet('/api/account-classifications/type/Investments')) as {
      accounts?: unknown
    }

    // The page does `accounts.includes(name)`, so an absent array is a crash.
    expect(Array.isArray(payload.accounts)).toBe(true)
    const accounts = payload.accounts as string[]
    expect(accounts.length).toBeGreaterThan(0)
    for (const name of accounts) {
      expect(typeof name).toBe('string')
    }
  })

  it('keeps the classification map on the generic route, so the two do not collide', async () => {
    const map = (await demoGet('/api/account-classifications')) as Record<string, string>

    expect(Array.isArray(map)).toBe(false)
    expect(map).not.toHaveProperty('accounts')
    // Every value is a classification name, not an account name.
    expect(Object.values(map).length).toBeGreaterThan(0)
  })

  it('derives the typed list from the same map it reports, so they cannot drift', async () => {
    const map = (await demoGet('/api/account-classifications')) as Record<string, string>
    const { accounts } = (await demoGet('/api/account-classifications/type/Investments')) as {
      accounts: string[]
    }

    const expected = Object.entries(map)
      .filter(([, type]) => type === 'Investments')
      .map(([name]) => name)

    expect(accounts.toSorted()).toEqual(expected.toSorted())
  })

  it('returns an empty list, not a crash, for a classification nobody uses', async () => {
    const { accounts } = (await demoGet('/api/account-classifications/type/NoSuchType')) as {
      accounts: string[]
    }

    expect(accounts).toEqual([])
  })

  it('splits transfer routing labels out of the category facet, matching the backend', async () => {
    // Transfers store a per-account-pair label in `category`, so on a mature
    // ledger they outnumber real categories several times over. Demo mode has to
    // apply the SAME transfer-only rule as the SQL facet query, otherwise the
    // dropdown differs between demo and real accounts.
    const facets = (await demoGet('/api/transactions/facets')) as {
      categories: string[]
      transfer_categories: string[]
    }

    expect(Array.isArray(facets.categories)).toBe(true)
    expect(Array.isArray(facets.transfer_categories)).toBe(true)
    // Partition: no category may appear in both lists.
    const overlap = facets.categories.filter((c) => facets.transfer_categories.includes(c))
    expect(overlap).toEqual([])
  })

  it('answers a URL-encoded classification name', async () => {
    // 'Loans/Lended' contains a slash, so it arrives percent-encoded and must not
    // be read as an extra path segment.
    const { accounts } = (await demoGet(
      `/api/account-classifications/type/${encodeURIComponent('Loans/Lended')}`,
    )) as { accounts: string[] }

    expect(accounts.length).toBeGreaterThan(0)
  })
})
