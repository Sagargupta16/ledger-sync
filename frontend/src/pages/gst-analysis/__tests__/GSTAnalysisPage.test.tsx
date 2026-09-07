import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  useGSTAnalysis: vi.fn(() => ({
    allFYs: [],
    effectiveFY: '',
    setSelectedFY: vi.fn(),
    gstData: null,
    taxableSlabs: [],
    hasData: false,
    isLoading: true,
    isError: false,
    retry: vi.fn(),
  })),
}))

vi.mock('../useGSTAnalysis', () => ({ useGSTAnalysis: mocks.useGSTAnalysis }))

const GSTAnalysisPage = (await import('../GSTAnalysisPage')).default

describe('GSTAnalysisPage loading state', () => {
  it('mirrors the three-card summary grid and mobile span', () => {
    render(
      <MemoryRouter>
        <GSTAnalysisPage />
      </MemoryRouter>,
    )

    const status = screen.getByRole('status')
    const summaryGrid = status.querySelector(':scope > .grid-cols-2')

    expect(summaryGrid).toHaveClass('gap-3', 'sm:grid-cols-3', 'sm:gap-4')
    expect(summaryGrid).not.toHaveClass('lg:grid-cols-4')

    const cards = Array.from(summaryGrid?.children ?? [])
    expect(cards).toHaveLength(3)
    expect(cards[0]).toHaveClass('p-3', 'sm:p-5')
    expect(cards[1]).toHaveClass('p-3', 'sm:p-5')
    expect(cards[2]).toHaveClass('col-span-2', 'p-3', 'sm:col-span-1', 'sm:p-5')
  })
})
