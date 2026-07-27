import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeAll, describe, expect, it } from 'vitest'

import { useDemoStore } from '@/store/demoStore'

import MerchantIntelligencePage from '../MerchantIntelligencePage'

/**
 * End-to-end demo-mode probe for `/merchants`.
 *
 * Unlike `renderProbe`, this seeds NOTHING: demo mode is switched on and the
 * page's own TanStack hook issues a real axios GET, which the demo interceptor
 * in `services/api/client.ts` answers from
 * `generateDemoMerchantIntelligence`. That is the exact path a user hitting
 * /merchants in demo mode takes, so it is the only way to prove the served
 * payload carries `label_kind` -- a hand-written row would prove the test's own
 * fixture, not the generator.
 */

beforeAll(() => {
  if (globalThis.IntersectionObserver === undefined) {
    class NoopIntersectionObserver implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = ''
      readonly scrollMargin = ''
      readonly thresholds: readonly number[] = []
      disconnect() {}
      observe() {}
      unobserve() {}
      takeRecords(): IntersectionObserverEntry[] {
        return []
      }
    }
    Object.defineProperty(globalThis, 'IntersectionObserver', {
      value: NoopIntersectionObserver,
      writable: true,
    })
  }
  useDemoStore.setState({ isDemoMode: true })
})

function renderInDemoMode() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MerchantIntelligencePage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('/merchants in demo mode', () => {
  it('shows a Notes chip and no Unclassified chip', async () => {
    renderInDemoMode()

    const notes = await waitFor(() => screen.getByRole('button', { name: /^Notes/ }), {
      timeout: 5000,
    })
    // The chip's trailing count is the row set it yields -- a nonzero count is
    // what proves the demo rows landed in the descriptor bucket.
    expect(notes.textContent).toMatch(/^Notes\d+$/)
    expect(Number(notes.textContent?.replace('Notes', ''))).toBeGreaterThan(0)

    // MerchantFilters hides a zero-count kind, so the bucket reserved for
    // pre-label_kind rollups must not offer a chip at all.
    expect(screen.queryByRole('button', { name: /^Unclassified/ })).not.toBeInTheDocument()
  })

  it('drops the pre-label_kind honesty banner', async () => {
    renderInDemoMode()
    await waitFor(() => screen.getByRole('button', { name: /^Notes/ }), { timeout: 5000 })
    // Demo mode is not a stale rollup, so it must not claim to be one.
    expect(screen.queryByText(/predates payee classification/)).not.toBeInTheDocument()
  })

  it('badges rows as notes rather than leaving them unlabelled', async () => {
    renderInDemoMode()
    await waitFor(() => screen.getByRole('button', { name: /^Notes/ }), { timeout: 5000 })
    expect(
      screen.getAllByTitle('Raw transaction note, not a confirmed payee. This is what was bought.')
        .length,
    ).toBeGreaterThan(0)
  })
})
