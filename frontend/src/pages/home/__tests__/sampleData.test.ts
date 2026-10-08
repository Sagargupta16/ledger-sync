import { describe, expect, it } from 'vitest'

import { NODE_WIDTH, layoutFlow } from '../components/flowLayout'
import {
  SAMPLE_AVG_SPENDING,
  SAMPLE_FLOW,
  SAMPLE_INCOME,
  SAMPLE_KPIS,
  SAMPLE_MONTHS,
  SAMPLE_SAVINGS_RATE,
  formatInr,
} from '../sampleData'

describe('landing sample data', () => {
  it('splits the flow month income exactly, with the chart agreeing on that month', () => {
    const latest = SAMPLE_MONTHS.at(-1)
    const spending = SAMPLE_FLOW.find((branch) => branch.key === 'spending')

    expect(SAMPLE_FLOW.reduce((sum, branch) => sum + branch.value, 0)).toBe(SAMPLE_INCOME)
    expect(latest?.income).toBe(SAMPLE_INCOME)
    expect(spending?.value).toBe(latest?.spending)
    expect(SAMPLE_FLOW.every((branch) => branch.value > 0)).toBe(true)
  })

  it('derives the KPI figures from the same numbers', () => {
    expect(SAMPLE_AVG_SPENDING).toBe(78_000)
    expect(SAMPLE_SAVINGS_RATE).toBeCloseTo(48.8125)
    expect(SAMPLE_KPIS.map((kpi) => kpi.format(kpi.value))).toEqual([
      '₹24,85,000',
      '48.8%',
      '₹3,60,000',
      '₹78,000',
    ])
  })

  it('formats rupees with Indian digit grouping and no paise', () => {
    expect(formatInr(2_485_000)).toBe('₹24,85,000')
    expect(formatInr(37_625.4)).toBe('₹37,625')
  })
})

describe('layoutFlow', () => {
  const options = { width: 340, height: 248, labelWidth: 112, gap: 14, padY: 6 }
  const layout = layoutFlow(SAMPLE_FLOW, options)

  it('stacks ribbons edge to edge on the source node', () => {
    const totalThickness = layout.links.reduce((sum, link) => sum + link.thickness, 0)
    expect(layout.source.height).toBeCloseTo(totalThickness)
    expect(layout.links[0]?.path.startsWith(`M${NODE_WIDTH} `)).toBe(true)
  })

  it('separates target nodes by the gap and keeps them inside the frame', () => {
    layout.links.forEach((link, i) => {
      const next = layout.links[i + 1]
      if (next) expect(next.nodeY - (link.nodeY + link.thickness)).toBeCloseTo(options.gap)
    })
    const last = layout.links.at(-1)
    expect(last && last.nodeY + last.thickness).toBeCloseTo(options.height - options.padY)
    expect(layout.links[0]?.nodeY).toBe(options.padY)
  })

  it('sizes ribbons by value and reserves the label column', () => {
    const [spending, , , tax] = layout.links
    expect(spending && tax && spending.thickness / tax.thickness).toBeCloseTo(78_000 / 24_375)
    expect(layout.labelX + 100).toBeLessThanOrEqual(options.width)
    expect(layout.links.reduce((sum, link) => sum + link.share, 0)).toBeCloseTo(1)
  })
})
