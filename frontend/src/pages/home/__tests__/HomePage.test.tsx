import { fireEvent, render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'

import { enterDemoMode } from '@/lib/demo'
import { useMotionStore } from '@/store/motionStore'

import HomePage from '../HomePage'

type Navigate = (to: string, options?: { replace?: boolean }) => void

vi.mock('@/lib/demo', () => ({
  enterDemoMode: vi.fn((_client: unknown, navigate: Navigate) => {
    navigate('/dashboard', { replace: true })
  }),
}))

// The real modal fetches OAuth providers on open; only its visibility matters here.
vi.mock('@/components/shared/AuthModal', () => ({
  AuthModal: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div role="dialog" aria-label="Sign in" /> : null,
}))

/**
 * jsdom has no IntersectionObserver. This one never reports an intersection,
 * so in Full motion every in-view animation stays at its starting frame.
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
})

afterEach(() => {
  useMotionStore.getState().setMode('full')
  vi.mocked(enterDemoMode).mockClear()
})

function renderHome() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/dashboard" element={<p>Dashboard page</p>} />
          <Route path="/income-expense-flow" element={<p>Cash Flow page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const countUps = (container: HTMLElement) =>
  [...container.querySelectorAll('[data-countup]')].map((node) => node.textContent)

const flowLabels = (container: HTMLElement) =>
  [...container.querySelectorAll('figure svg text')].map((node) => node.textContent)

describe('HomePage', () => {
  it('keeps every call to action for signed-out visitors', () => {
    renderHome()

    expect(screen.getByRole('button', { name: /try the demo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /get started free/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create free account/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /explore demo/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /see capabilities/i })).toHaveAttribute(
      'href',
      '#features',
    )
    expect(screen.getByText(/for better financial management/i)).toBeInTheDocument()
  })

  it('enters the demo from the hero', () => {
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /try the demo/i }))

    expect(enterDemoMode).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Dashboard page')).toBeInTheDocument()
  })

  it('opens the page a capability card describes inside the demo', () => {
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /see cash flow in demo/i }))

    expect(enterDemoMode).toHaveBeenCalledTimes(1)
    expect(screen.getByText('Cash Flow page')).toBeInTheDocument()
  })

  it('sends the AI assistant card to sign-in, since the demo has no assistant', () => {
    renderHome()

    fireEvent.click(screen.getByRole('button', { name: /sign in to use it/i }))

    expect(enterDemoMode).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog', { name: 'Sign in' })).toBeInTheDocument()
  })

  it('labels every sample visual as sample data', () => {
    renderHome()

    expect(screen.getAllByText('Sample data')).toHaveLength(2)
    expect(screen.getByText(/illustrative figures, not a real account/i)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sample month/i })).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /sample income and spending/i })).toBeInTheDocument()
  })

  it('holds count-ups at zero and runs the flow beads until the visuals are in view', () => {
    const { container } = renderHome()

    expect(new Set(countUps(container))).toEqual(new Set(['₹0', '0.0%']))
    expect(flowLabels(container)).toContain('₹012%')
    expect(container.querySelectorAll('[data-flow-bead]')).toHaveLength(4)
  })

  it('renders final values and no flow loop in Reduced motion mode', () => {
    useMotionStore.getState().setMode('reduced')
    const { container } = renderHome()

    expect(countUps(container)).toEqual([
      '₹2,00,000',
      '₹24,85,000',
      '48.8%',
      '₹3,60,000',
      '₹78,000',
    ])
    expect(flowLabels(container)).toEqual([
      'Spending',
      '₹78,00039%',
      'Investments',
      '₹60,00030%',
      'Savings',
      '₹37,62519%',
      'Tax',
      '₹24,37512%',
    ])
    expect(container.querySelectorAll('[data-flow-bead]')).toHaveLength(0)
  })
})
