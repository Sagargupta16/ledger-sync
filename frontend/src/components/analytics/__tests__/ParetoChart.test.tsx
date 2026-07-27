/**
 * ParetoChart contract tests.
 *
 * Two things here are otherwise untestable through the rendered DOM, because
 * jsdom reports a 0x0 container and Recharts never paints:
 *
 *  1. The tooltip formatter. Recharts resolves a tooltip entry's `name` to the
 *     series' `name` prop, never its `dataKey`, so the cumulative-% series must
 *     be matched on the display name. The earlier `name === 'cumulativePct'`
 *     check could never be true and percentages were formatted as rupees.
 *  2. The per-bar vital-few/long-tail colour split, which has to agree with the
 *     headline count.
 *
 * Both are asserted by capturing the props the component hands Recharts.
 */

import type { ReactNode } from 'react'

import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { rawColors } from '@/constants/colors'

interface TooltipCapture {
  formatter?: (value: unknown, name: unknown) => string
}

/** The datum rows handed to the chart; each carries its own bar `fill`. */
type CapturedRow = { category: string; fill?: string }

const captured: {
  tooltip?: TooltipCapture
  line?: { name?: string; dataKey?: string }
  rows: CapturedRow[]
} = { rows: [] }

vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts')
  const Passthrough = ({ children }: { readonly children?: ReactNode }) => <div>{children}</div>
  return {
    ...actual,
    ResponsiveContainer: Passthrough,
    // The bar colours now ride on the chart's `data` rows rather than on `<Cell>`
    // children, so the capture point moves to the chart itself.
    ComposedChart: ({ data, children }: { readonly data?: CapturedRow[]; readonly children?: ReactNode }) => {
      captured.rows = data ?? []
      return <div>{children}</div>
    },
    Bar: Passthrough,
    Tooltip: (props: TooltipCapture) => {
      captured.tooltip = props
      return null
    },
    Line: (props: { name?: string; dataKey?: string }) => {
      captured.line = props
      return null
    },
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Legend: () => null,
    ReferenceLine: () => null,
  }
})

/** Imported after the mock is registered so the mocked recharts is used. */
const { default: ParetoChart } = await import('../ParetoChart')

function equalPayees(count: number, each = 1000): Record<string, number> {
  const breakdown: Record<string, number> = {}
  for (let i = 0; i < count; i++) breakdown[`P${i}`] = each
  return breakdown
}

beforeEach(() => {
  captured.tooltip = undefined
  captured.line = undefined
  captured.rows = []
})

describe('ParetoChart tooltip formatter', () => {
  it('formats the cumulative series as a percentage, matched on its display name', () => {
    render(<ParetoChart categoryBreakdown={{ Rent: 30_000, Food: 12_000 }} />)

    const seriesName = captured.line?.name
    expect(seriesName).toBe('Cumulative %')
    // Matching on the name prop is the whole fix: had the formatter kept
    // matching the dataKey, this would come back as "₹56" instead.
    expect(captured.tooltip?.formatter?.(55.55, seriesName)).toBe('55.5%')
  })

  it('still formats the spend series as currency', () => {
    render(<ParetoChart categoryBreakdown={{ Rent: 30_000, Food: 12_000 }} />)

    expect(captured.tooltip?.formatter?.(1000, 'Spend')).toBe('₹1,000')
  })

  it('does not fall back to the percentage branch for the dataKey string', () => {
    // Guards the regression directly: 'cumulativePct' is the dataKey, and a
    // formatter matching on it would treat rupee values as percentages.
    render(<ParetoChart categoryBreakdown={{ Rent: 30_000 }} />)

    expect(captured.tooltip?.formatter?.(1000, 'cumulativePct')).toBe('₹1,000')
  })
})

describe('ParetoChart vital-few count', () => {
  it('counts over every label, not just the capped bars', () => {
    // 40 equal payees: 32 of them reach 80%. Counting over the 12 rendered bars
    // (11 payees + one synthetic "Other") capped the headline at 12 and
    // contradicted the same statistic computed elsewhere on the page.
    render(<ParetoChart categoryBreakdown={equalPayees(40)} itemNoun="payee" />)

    expect(
      screen.getByText('32 payees make up 80% of your spend -- the rest are the long tail'),
    ).toBeInTheDocument()
  })

  it('never colours the synthetic Other bucket as vital few', () => {
    render(<ParetoChart categoryBreakdown={equalPayees(40)} itemNoun="payee" />)

    // 12 bars: 11 real payees (all inside the 32-payee vital few) plus "Other",
    // which merges labels from both sides of the cutoff and so stays muted.
    expect(captured.rows).toHaveLength(12)
    expect(captured.rows.slice(0, 11).map((r) => r.fill)).toEqual(
      Array.from({ length: 11 }, () => rawColors.app.orange),
    )
    expect(captured.rows.at(-1)?.fill).toBe(rawColors.text.tertiary)
  })

  it('splits vital few from long tail when everything fits under the bar cap', () => {
    render(<ParetoChart categoryBreakdown={{ A: 80, B: 10, C: 5, D: 5 }} />)

    expect(
      screen.getByText('1 category makes up 80% of your spend -- the rest are the long tail'),
    ).toBeInTheDocument()
    expect(captured.rows.map((r) => r.fill)).toEqual([
      rawColors.app.orange,
      rawColors.text.tertiary,
      rawColors.text.tertiary,
      rawColors.text.tertiary,
    ])
  })

  it('pins each colour to its own category, so a reorder cannot shift the ramp', () => {
    // The point of carrying `fill` on the datum: colour and category travel
    // together. `<Cell>` children were matched positionally against the RENDERED
    // bar list, so any dropped bar slid every colour onto the wrong category.
    render(<ParetoChart categoryBreakdown={{ A: 80, B: 10, C: 5, D: 5 }} />)

    const byCategory = new Map(captured.rows.map((r) => [r.category, r.fill]))
    expect(byCategory.get('A')).toBe(rawColors.app.orange)
    expect(byCategory.get('B')).toBe(rawColors.text.tertiary)
  })

  it('renders the empty state and no series when there is nothing to chart', () => {
    render(<ParetoChart categoryBreakdown={{}} itemNoun="payee" />)

    expect(screen.getByText('Which payees make up 80% of your spend')).toBeInTheDocument()
    expect(captured.rows).toHaveLength(0)
  })
})
