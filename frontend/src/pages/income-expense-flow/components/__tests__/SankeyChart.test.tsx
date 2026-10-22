import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useMotionStore } from '@/store/motionStore'
import type { Transaction } from '@/types'

import { buildCategoryView, buildOverviewView, type DrillCrumb, type FlowEntry } from '../../sankeyDrilldown'
import { SankeyChart } from '../SankeyChart'

const familyCrumb: DrillCrumb = { label: 'Family', view: 'category', flow: 'expense' }
const topIncome: FlowEntry[] = [{ name: 'Salary', amount: 100000, drill: null }]
const topExpense: FlowEntry[] = [
  { name: 'Family', amount: 30000, drill: familyCrumb },
  { name: 'Rent', amount: 15000, drill: null },
]

function txn(category: string, amount: number, subcategory: string): Transaction {
  return { id: `${category}-${subcategory}`, date: '2026-05-10', amount, type: 'Expense', category, subcategory, account: 'Bank' }
}

function setup(overrides: Partial<Parameters<typeof SankeyChart>[0]> = {}) {
  const props = {
    isLoading: false,
    isMobile: false,
    view: buildOverviewView({ incomeEntries: topIncome, expenseEntries: topExpense, totalIncome: 100000, totalExpense: 45000, netSavings: 55000 }),
    drillPath: [],
    drillDirection: 'in' as const,
    zoomOrigin: null,
    drillTo: vi.fn(),
    drillInto: vi.fn(),
    drillBack: vi.fn(),
    topIncome,
    topExpense,
    totalIncome: 100000,
    totalExpense: 45000,
    totalTax: 0,
    netSavings: 55000,
    currentFY: 'FY 2026-27',
    ...overrides,
  }
  render(<SankeyChart {...props} />)
  return { props, frame: screen.getByRole('img', { name: /^Sankey diagram/ }) }
}

// Unmount first, so restoring full motion cannot re-render a chart outside act().
afterEach(() => {
  cleanup()
  useMotionStore.setState({ mode: 'full' })
})

describe('SankeyChart', () => {
  it('draws the flow with Motion-driven beads: no SMIL <animate> and no native <title>', () => {
    const { frame } = setup()
    expect(frame.querySelector('svg')).not.toBeNull()
    expect(frame.querySelectorAll('animate, animateMotion, animateTransform, set')).toHaveLength(0)
    expect(frame.querySelector('title')).toBeNull()
    // One bead line per ribbon: Salary in, Savings and Expenses out of the pool, Family and Rent.
    expect(frame.querySelectorAll('path[stroke-dasharray]')).toHaveLength(5)
  })

  it('stops the bead flow entirely when motion is Reduced', () => {
    useMotionStore.setState({ mode: 'reduced' })
    const { frame } = setup()
    expect(frame.querySelectorAll('path[stroke-dasharray]')).toHaveLength(0)
    expect(frame.querySelectorAll('path').length).toBeGreaterThan(0)
  })

  it('drills into a selectable node with its crumb and its centre as the zoom origin', () => {
    const { props } = setup()
    fireEvent.click(screen.getByText('Family ›'))
    expect(props.drillInto).toHaveBeenCalledWith(familyCrumb, { x: expect.any(Number) as number, y: expect.any(Number) as number })
  })

  it('reads out an arrowed-to node, and Escape clears that before it goes back', () => {
    const view = buildCategoryView([txn('Family', 500, 'Parents'), txn('Family', 300, 'Sister')], familyCrumb)
    const { props, frame } = setup({ view, drillPath: [familyCrumb] })
    act(() => frame.focus())
    fireEvent.keyDown(frame, { key: 'ArrowDown' })
    expect(screen.getByText('100.0% of Family')).toBeInTheDocument()
    expect(document.body.querySelector('[aria-live="polite"]')?.textContent).toMatch(/^Family: .+, 100\.0% of Family$/)
    fireEvent.keyDown(frame, { key: 'Escape' })
    expect(props.drillBack).not.toHaveBeenCalled()
    fireEvent.keyDown(frame, { key: 'Escape' })
    expect(props.drillBack).toHaveBeenCalledTimes(1)
  })

  it('shows Savings in the diagram, legend and table while there are savings', () => {
    setup()
    expect(screen.getAllByText('Savings')).toHaveLength(3)
  })

  it('drops the orphan Savings node from the diagram, legend and table in a deficit', () => {
    const deficitIncome: FlowEntry[] = [{ name: 'Salary', amount: 40000, drill: null }]
    setup({
      view: buildOverviewView({ incomeEntries: deficitIncome, expenseEntries: topExpense, totalIncome: 40000, totalExpense: 45000, netSavings: -5000 }),
      topIncome: deficitIncome,
      totalIncome: 40000,
      netSavings: -5000,
    })
    expect(screen.queryByText('Savings')).toBeNull()
    expect(screen.getAllByText('Rent')).toHaveLength(2) // the diagram label and the table row
  })
})
