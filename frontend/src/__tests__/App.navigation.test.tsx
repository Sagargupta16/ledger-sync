import { use, useState } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import App from '@/App'
import { DEMO_TOKENS, DEMO_USER } from '@/lib/demo/enterDemoMode'
import { queryClient } from '@/lib/queryClient'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useMotionStore, type MotionMode } from '@/store/motionStore'

const pendingPages = vi.hoisted(() => new Map<string, Promise<void>>())
const releases: (() => void)[] = []
const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

vi.mock('@/hooks/api/useAuth', () => ({ useAuthInit: vi.fn() }))
vi.mock('@/hooks/api/useExchangeRate', () => ({ useExchangeRate: vi.fn() }))
vi.mock('@/components/shared/PreferencesProvider', () => ({
  PreferencesProvider: ({ children }: Readonly<{ children: React.ReactNode }>) => children,
}))
vi.mock('@/components/shared/CommandPalette', () => ({ default: () => null }))
vi.mock('@/components/chat/ChatWidget', () => ({ default: () => null }))
vi.mock('@/components/layout/MobileTabBar', () => ({ default: () => null }))
vi.mock('@/components/layout/StaleAnalyticsAlert', () => ({ default: () => null }))
vi.mock('@/components/layout/Sidebar/Sidebar', () => ({ default: Navigation }))
vi.mock('@/pages/DashboardPage', () => ({ default: Dashboard }))
vi.mock('@/pages/home/HomePage', () => ({ default: () => <h1>Public home</h1> }))
vi.mock('@/pages/DemoEntryPage', () => ({ default: () => <h1>Demo entry</h1> }))
vi.mock('@/pages/OAuthCallbackPage', () => ({ default: () => <h1>Sign-in callback</h1> }))
vi.mock('@/pages/spending-analysis/SpendingAnalysisPage', () => ({
  default: function Spending() {
    const pending = pendingPages.get('spending')
    if (pending) use(pending)
    return <h1>Expense Analysis</h1>
  },
}))
vi.mock('@/pages/income-analysis/IncomeAnalysisPage', () => ({
  default: function Income() {
    const pending = pendingPages.get('income')
    if (pending) use(pending)
    return <h1>Income Analysis</h1>
  },
}))

function Navigation() {
  const navigate = useNavigate()
  return (
    <nav>
      <Link to="/spending">Expense Analysis</Link>
      <button type="button" onClick={() => { void navigate('/income') }}>Programmatic income</button>
      <button type="button" onClick={() => { void navigate(-1) }}>Back</button>
      <button type="button" onClick={() => { void navigate(1) }}>Forward</button>
      <Link to="/">Public home</Link>
      <Link to="/demo">Demo entry</Link>
      <Link to="/auth/callback/google">Sign-in callback</Link>
    </nav>
  )
}

function Dashboard() {
  const [interactions, setInteractions] = useState(0)
  return (
    <>
      <h1>Dashboard</h1>
      <button type="button" onClick={() => setInteractions((count) => count + 1)}>
        Interactions: {interactions}
      </button>
    </>
  )
}

function holdPage(name: string) {
  let release!: () => void
  const pending = new Promise<void>((resolve) => { release = resolve })
  pendingPages.set(name, pending)
  releases.push(release)
  return () => act(async () => {
    release()
    await pending
  })
}

function expectPending(title: string) {
  expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true')
  expect(screen.getByRole('status')).toHaveTextContent(`Opening ${title}`)
  expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
}

async function click(role: 'link' | 'button', name: string) {
  await act(async () => {
    fireEvent.click(screen.getByRole(role, { name }))
    await Promise.resolve()
  })
}

beforeEach(() => {
  window.history.replaceState(null, '', '/dashboard')
  Object.defineProperty(HTMLElement.prototype, 'scrollTo', { configurable: true, value: vi.fn() })
  useDemoStore.getState().enterDemo()
  useAuthStore.getState().login(DEMO_USER, DEMO_TOKENS)
})

afterEach(() => {
  cleanup()
  for (const release of releases.splice(0)) release()
  pendingPages.clear()
  queryClient.clear()
  useDemoStore.getState().exitDemo()
  useAuthStore.getState().logout()
  useMotionStore.getState().setMode('full')
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  }
})

describe('App navigation pending feedback', () => {
  it.each<MotionMode>(['full', 'reduced'])('retains usable content and announces a suspended route in %s motion', async (mode) => {
    const release = holdPage('spending')
    useMotionStore.getState().setMode(mode)
    render(<App />)
    const main = screen.getByRole('main')
    const currency = document.querySelector('.currency-atmosphere')

    await click('link', 'Expense Analysis')
    expect(window.location.pathname).toBe('/spending')
    expectPending('Expense Analysis')
    await click('button', 'Interactions: 0')
    expect(screen.getByRole('button', { name: 'Interactions: 1' })).toBeVisible()

    await release()
    await screen.findByRole('heading', { name: 'Expense Analysis' })
    expect(screen.getByRole('main')).toBe(main)
    expect(main).toHaveAttribute('aria-busy', 'false')
    expect(screen.getByRole('status')).toHaveTextContent(/^$/)
    expect(document.querySelector('.currency-atmosphere')).toBe(currency)
  })

  it('tracks programmatic navigation and history while imports remain pending', async () => {
    const releaseSpending = holdPage('spending')
    const releaseIncome = holdPage('income')
    render(<App />)

    await click('link', 'Expense Analysis')
    expectPending('Expense Analysis')
    await click('button', 'Programmatic income')
    expectPending('Income Analysis')
    await click('button', 'Back')
    await waitFor(() => expect(window.location.pathname).toBe('/spending'))
    expectPending('Expense Analysis')
    await click('button', 'Forward')
    await waitFor(() => expect(window.location.pathname).toBe('/income'))
    expectPending('Income Analysis')

    await releaseIncome()
    await screen.findByRole('heading', { name: 'Income Analysis' })
    await releaseSpending()
    expect(screen.getByRole('heading', { name: 'Income Analysis' })).toBeVisible()
    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'false')
  })

  it.each(['Public home', 'Demo entry', 'Sign-in callback'])('immediately switches to %s during a suspended workspace navigation', async (title) => {
    const release = holdPage('spending')
    render(<App />)
    await click('link', 'Expense Analysis')
    expectPending('Expense Analysis')

    await click('link', title)
    expect(screen.getByRole('heading', { name: title })).toBeVisible()
    expect(document.querySelector('.ledger-workspace')).toBeNull()
    await release()
    expect(screen.getByRole('heading', { name: title })).toBeVisible()
  })
})
