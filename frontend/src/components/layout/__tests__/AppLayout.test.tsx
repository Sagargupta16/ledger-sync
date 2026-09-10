import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Link, MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom'
import { motion, MotionConfig } from 'motion/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { FADE_UP } from '@/constants/animations'
import { useMotionStore, type MotionMode } from '@/store/motionStore'

import AppLayout from '../AppLayout'

const originalScrollTo = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTo')

vi.mock('@/hooks/api/useExchangeRate', () => ({ useExchangeRate: vi.fn() }))
vi.mock('@/components/shared/CommandPalette', () => ({ default: () => null }))
vi.mock('@/components/chat/ChatWidget', () => ({ default: () => null }))
vi.mock('../Sidebar/Sidebar', () => ({ default: () => null }))
vi.mock('../MobileTabBar', () => ({ default: () => null }))
vi.mock('../StaleAnalyticsAlert', () => ({ default: () => null }))
vi.mock('../WorkspaceHeader', () => ({ default: () => null }))

function DashboardRoute() {
  return <motion.section {...FADE_UP}><h1>Dashboard</h1></motion.section>
}

function SpendingRoute() {
  return <motion.section {...FADE_UP}><h1>Expense Analysis</h1></motion.section>
}

function IncomeRoute() {
  return <motion.section {...FADE_UP}><h1>Income Analysis</h1></motion.section>
}

function Navigation() {
  const navigate = useNavigate()
  return (
    <nav>
      <Link to="/spending">Expense Analysis</Link>
      <Link to="/income">Income Analysis</Link>
      <button type="button" onClick={() => { void navigate(-1) }}>Back</button>
      <button type="button" onClick={() => { void navigate(1) }}>Forward</button>
    </nav>
  )
}

function renderLayout(mode: MotionMode) {
  useMotionStore.getState().setMode(mode)
  return render(
    <StrictMode>
      <MotionConfig reducedMotion={mode === 'reduced' ? 'always' : 'never'} skipAnimations={mode === 'reduced'}>
        <MemoryRouter initialEntries={['/dashboard']}>
          <Navigation />
          <Routes>
            <Route element={<AppLayout />}>
              <Route path="/dashboard" element={<DashboardRoute />} />
              <Route path="/spending" element={<SpendingRoute />} />
              <Route path="/income" element={<IncomeRoute />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </MotionConfig>
    </StrictMode>,
  )
}

async function expectSettledPage(name: string) {
  await waitFor(() => {
    const main = screen.getByRole('main')
    expect(main.children).toHaveLength(1)
    expect(screen.getByRole('heading', { name })).toBeInTheDocument()
    expect(main.firstElementChild).toHaveStyle({ opacity: '1', transform: 'none' })
  })
}

afterEach(() => {
  if (originalScrollTo) {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', originalScrollTo)
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollTo')
  }
  useMotionStore.getState().setMode('full')
})

describe('AppLayout route motion', () => {
  it.each<MotionMode>(['full', 'reduced'])('completes sidebar and history navigation with %s motion', async (mode) => {
    Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
      configurable: true,
      value: vi.fn(),
    })
    renderLayout(mode)
    await expectSettledPage('Dashboard')

    fireEvent.click(screen.getByRole('link', { name: 'Expense Analysis' }))
    if (mode === 'full') {
      // The outgoing route must keep its own content while its exit runs.
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument()
    }
    await expectSettledPage('Expense Analysis')

    fireEvent.click(screen.getByRole('link', { name: 'Income Analysis' }))
    await expectSettledPage('Income Analysis')
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    await expectSettledPage('Expense Analysis')
    fireEvent.click(screen.getByRole('button', { name: 'Forward' }))
    await expectSettledPage('Income Analysis')
  })
})
