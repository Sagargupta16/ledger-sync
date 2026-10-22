/**
 * ParetoChart contract tests.
 *
 * The model and the tooltip formats are pure, so the 80/20 maths, the
 * vital-few/long-tail colour split (which has to agree with the headline count)
 * and the Spend / Cumulative % formats are asserted directly. The render tests
 * cover what a reader gets from the DOM: the chart's name, the summary, the
 * coloured bars, the keyboard tooltip and the data table. Reduced motion makes
 * the kit paint final geometry at once.
 */

import { fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { rawColors } from '@/constants/colors'
import { useMotionStore } from '@/store/motionStore'

import ParetoChart from '../ParetoChart'
import { buildParetoModel, buildParetoSummary, paretoTooltipSeries, pluralize, type ParetoModel } from '../paretoModel'

const VITAL = SEMANTIC_COLORS.expense
const TAIL = rawColors.text.tertiary

function model(breakdown: Record<string, number>, { maxBars = 12, threshold = 80 } = {}): ParetoModel {
  return buildParetoModel(breakdown, { maxBars, threshold, palette: { vital: VITAL, tail: TAIL } })
}

function summary({ rows, vitalFewCount }: ParetoModel, threshold = 80, noun = 'category'): string {
  return buildParetoSummary(rows.length, vitalFewCount, threshold, noun, pluralize(noun))
}

function equalPayees(count: number, each = 1000): Record<string, number> {
  const breakdown: Record<string, number> = {}
  for (let i = 0; i < count; i++) breakdown[`P${i}`] = each
  return breakdown
}

beforeAll(() => useMotionStore.getState().setMode('reduced'))
afterAll(() => useMotionStore.getState().setMode('full'))

describe('Pareto tooltip formats', () => {
  // Each format travels with its own series key, so a rupee value can never be
  // read as a share (the old tooltip matched on display names and got it wrong).
  const [spend, share] = paretoTooltipSeries(VITAL, rawColors.app.blue)

  it('formats the cumulative series as a percentage', () => {
    expect(share).toMatchObject({ key: 'cumulativePct', label: 'Cumulative %' })
    expect(share.format?.(55.55, {})).toBe('55.5%')
  })

  it('formats the spend series as currency', () => {
    expect(spend).toMatchObject({ key: 'amount', label: 'Spend' })
    expect(spend.format?.(1000, {})).toBe('₹1,000.00')
  })
})

describe('buildParetoModel', () => {
  it('counts over every label, not just the capped bars', () => {
    // 40 equal payees: 32 of them reach 80%. Counting over the 12 drawn bars
    // (11 payees + one synthetic "Other") capped the headline at 12 and
    // contradicted the same statistic computed elsewhere on the page.
    const pareto = model(equalPayees(40))

    expect(pareto.vitalFewCount).toBe(32)
    expect(summary(pareto, 80, 'payee')).toBe('32 payees make up 80% of your spend -- the rest are the long tail')
  })

  it('never colours the synthetic Other bucket as vital few', () => {
    const { rows } = model(equalPayees(40))

    // 12 bars: 11 real payees (all inside the 32-payee vital few) plus "Other",
    // which merges labels from both sides of the cutoff and so stays muted.
    expect(rows).toHaveLength(12)
    expect(rows.slice(0, 11).map((r) => r.fill)).toEqual(Array.from({ length: 11 }, () => VITAL))
    expect(rows.at(-1)?.fill).toBe(TAIL)
  })

  it('splits vital few from long tail when everything fits under the bar cap', () => {
    const pareto = model({ A: 80, B: 10, C: 5, D: 5 })

    expect(summary(pareto)).toBe('1 category makes up 80% of your spend -- the rest are the long tail')
    expect(pareto.rows.map((r) => r.fill)).toEqual([VITAL, TAIL, TAIL, TAIL])
  })

  it('pins each colour to its own category, so a reorder cannot shift the ramp', () => {
    // Colour and category travel together on the row, whatever order they arrive in.
    const byCategory = new Map(model({ D: 5, B: 10, A: 80, C: 5 }).rows.map((r) => [r.category, r.fill]))

    expect(byCategory.get('A')).toBe(VITAL)
    expect(byCategory.get('B')).toBe(TAIL)
  })

  it('keeps an empty or all-zero breakdown empty', () => {
    expect(model({})).toEqual({ rows: [], vitalFewCount: 0 })
    expect(summary(model({}), 80, 'payee')).toBe('Which payees make up 80% of your spend')
    expect(model({ A: 0, B: 0 })).toEqual({ rows: [], vitalFewCount: 0 })
    expect(summary(model({ A: 0, B: 0 }))).toBe('Which categories make up 80% of your spend')
  })

  it('preserves tied row counts, zero rows and absolute amounts at a custom cutoff', () => {
    const pareto = model({ A: -25, B: 25, C: 25, D: 25, Zero: 0 }, { threshold: 75 })

    expect(summary(pareto, 75)).toBe('3 categories make up 75% of your spend -- the rest are the long tail')
    expect(pareto.rows.map((row) => row.amount)).toEqual([25, 25, 25, 25, 0])
    expect(pareto.rows.map((row) => row.cumulativePct)).toEqual([25, 50, 75, 100, 100])
    expect(pareto.rows.map((row) => row.fill)).toEqual([VITAL, VITAL, VITAL, TAIL, TAIL])
  })

  it('keeps a real Other label separate from the capped tail', () => {
    const pareto = model({ Other: 40, A: 30, B: 20, C: 10 }, { maxBars: 3, threshold: 60 })

    expect(summary(pareto, 60)).toBe('2 categories make up 60% of your spend -- the rest are the long tail')
    expect(pareto.rows.map((row) => row.category)).toEqual(['Other', 'A', 'Other'])
    // Labels repeat but keys do not: the chart's categories are the keys.
    expect(new Set(pareto.rows.map((row) => row.key)).size).toBe(3)
    expect(pareto.rows.map((row) => row.amount)).toEqual([40, 30, 30])
    expect(pareto.rows.map((row) => row.cumulativePct)).toEqual([40, 70, 100])
    expect(pareto.rows[0].fill).toBe(VITAL)
    expect(pareto.rows[2].fill).toBe(TAIL)
  })

  it('counts original rows even when the cap leaves only the Other bar', () => {
    const pareto = model(equalPayees(5, 20), { maxBars: 1 })

    expect(summary(pareto)).toBe('4 categories make up 80% of your spend -- the rest are the long tail')
    expect(pareto.rows).toEqual([
      expect.objectContaining({ category: 'Other', amount: 100, cumulativePct: 100, fill: TAIL }),
    ])
  })
})

describe('ParetoChart', () => {
  it('names the chart and states the vital few over every label', () => {
    render(<ParetoChart categoryBreakdown={equalPayees(40)} itemNoun="payee" />)

    expect(screen.getByRole('img', { name: /^Pareto chart of payee spending: bars show spend/ })).toBeInTheDocument()
    expect(screen.getByText('32 payees make up 80% of your spend -- the rest are the long tail')).toBeInTheDocument()
  })

  it('draws the vital few in the expense colour and the tail bar muted', () => {
    const { container } = render(<ParetoChart categoryBreakdown={equalPayees(40)} itemNoun="payee" />)

    expect(container.querySelectorAll(`svg path[fill="${VITAL}"]`)).toHaveLength(11)
    expect(container.querySelectorAll(`svg path[fill="${TAIL}"]`)).toHaveLength(1)
  })

  it('opens the tooltip on ArrowRight with the label, its spend and the running share', () => {
    render(<ParetoChart categoryBreakdown={{ Rent: 30_000, Food: 12_000 }} />)
    const chart = screen.getByRole('img', { name: /^Pareto chart of category spending/ })

    chart.focus()
    fireEvent.keyDown(chart, { key: 'ArrowRight' })

    // The tooltip layer is the frame's only HTML child; the heading is the label, not the row key.
    expect(chart.querySelector('div[aria-hidden="true"]')).toHaveTextContent(
      /^Rent\s*Spend\s*₹30,000\.00\s*Cumulative %\s*71\.4%$/,
    )
  })

  it('mirrors every bar in the data table, the tail bar included', () => {
    render(<ParetoChart categoryBreakdown={{ Other: 40, A: 30, B: 20, C: 10 }} maxBars={3} threshold={60} />)
    const table = screen.getByRole('table', { name: 'Pareto Analysis data' })

    expect(within(table).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['Other', 'A', 'Other'])
    expect(within(table).getAllByRole('row').at(-1)).toHaveTextContent(/^Other\s*₹30\.00\s*₹100\.00\s*100\.0%$/)
  })

  it('renders the empty state and no chart when there is nothing to chart', () => {
    render(<ParetoChart categoryBreakdown={{}} itemNoun="payee" />)

    expect(screen.getByText('Which payees make up 80% of your spend')).toBeInTheDocument()
    expect(screen.queryByRole('img')).not.toBeInTheDocument()
  })
})
