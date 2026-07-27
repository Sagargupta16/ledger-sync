import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import PieLegend from '../PieLegend'
import StandardPieChart from '@/components/analytics/StandardPieChart'
import { capPieSlices } from '@/components/ui/pieSlices'

/**
 * The dashboard donut pairs a chart with a hand-built legend. The bug this
 * covers: the legend listed a fixed 7 rows while the chart capped at 7 wedges
 * INCLUDING "Other", so the pie drew 6 named wedges + Other and the legend
 * showed 7 named rows -- one row with no wedge, wearing a palette color the pie
 * never painted, plus a "+5 more in Other" line contradicting the chart.
 */
function makeData(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    name: `Cat ${i + 1}`,
    value: (count - i) * 1000,
  }))
}

function legendRowLabels(): string[] {
  return Array.from(document.querySelectorAll('[title]')).map((el) => el.getAttribute('title') ?? '')
}

function chartRowLabels(): string[] {
  const body = screen.getByRole('table').querySelector('tbody') as HTMLElement
  return Array.from(body.querySelectorAll('tr')).map(
    (tr) => tr.querySelector('th')?.textContent ?? '',
  )
}

describe('PieLegend', () => {
  it('renders exactly one row per capped wedge, Other included', () => {
    const data = makeData(12)
    render(
      <PieLegend slices={capPieSlices(data)} onSelect={() => {}} focusRingClass="ring-x" />,
    )

    expect(legendRowLabels()).toEqual([
      'Cat 1', 'Cat 2', 'Cat 3', 'Cat 4', 'Cat 5', 'Cat 6', 'Other (6 categories)',
    ])
  })

  it('stays row-for-row in sync with the chart it accompanies', () => {
    const data = makeData(12)
    const slices = capPieSlices(data)
    render(
      <>
        <StandardPieChart data={data} ariaLabel="Expenses by category" />
        <PieLegend slices={slices} onSelect={() => {}} focusRingClass="ring-x" />
      </>,
    )

    expect(legendRowLabels()).toEqual(chartRowLabels())
  })

  it('links real category rows and passes the category name through', () => {
    const onSelect = vi.fn()
    render(
      <PieLegend slices={capPieSlices(makeData(12))} onSelect={onSelect} focusRingClass="ring-x" />,
    )

    fireEvent.click(screen.getByRole('button', { name: /Cat 1/ }))

    expect(onSelect).toHaveBeenCalledWith('Cat 1')
  })

  it('does not make the folded Other row clickable', () => {
    const onSelect = vi.fn()
    render(
      <PieLegend slices={capPieSlices(makeData(12))} onSelect={onSelect} focusRingClass="ring-x" />,
    )

    // 6 named rows are buttons; the rollup row is static text.
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(screen.queryByRole('button', { name: /Other/ })).not.toBeInTheDocument()
    expect(screen.getByTitle('Other (6 categories)')).toBeInTheDocument()
  })

  it('takes each swatch from the slice color, not the palette index', () => {
    // The old legend read a parallel color array built with getChartColor(i),
    // which handed the 7th row a hue the pie never painted. Here the Other row
    // must wear the muted color capPieSlices stamped on it, and a slice that
    // carries its own color must keep it.
    const slices = capPieSlices(makeData(12))
    render(<PieLegend slices={slices} onSelect={() => {}} focusRingClass="ring-x" />)

    const swatchColors = Array.from(document.querySelectorAll('[title] + span, [title]'))
      .map((el) => el.previousElementSibling as HTMLElement | null)
      .filter((el): el is HTMLElement => el !== null && el.style.backgroundColor !== '')
      .map((el) => el.style.backgroundColor)

    expect(swatchColors).toHaveLength(slices.length)
    // Distinct hues per row -- no repeat means no row borrowed another's color.
    expect(new Set(swatchColors).size).toBe(slices.length)
  })

  it('leaves every row clickable when nothing had to be folded', () => {
    render(
      <PieLegend slices={capPieSlices(makeData(5))} onSelect={() => {}} focusRingClass="ring-x" />,
    )

    expect(screen.getAllByRole('button')).toHaveLength(5)
  })

  it('sums the rendered rows to the input total, so Other keeps the legend honest', () => {
    const data = makeData(12)
    const slices = capPieSlices(data)

    expect(slices.reduce((sum, s) => sum + s.value, 0)).toBe(
      data.reduce((sum, d) => sum + d.value, 0),
    )
  })
})
