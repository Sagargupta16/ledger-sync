import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { useMotionStore } from '@/store/motionStore'

import TaxYearChart from '../TaxYearChart'
import { shortFyLabel, taxYearChartLayout } from '../taxChartLayout'
import type { TaxPlanningModel } from '../../useTaxPlanning'

const planning = {
  fyList: ['FY 2025-26', 'FY 2024-25'],
  transactionsByFY: {},
  multiYearProjections: [
    { fy: '2024-25', grossTaxable: 1_500_000, cashDeductions: 0 },
    { fy: '2025-26', grossTaxable: 3_000_000, cashDeductions: 0 },
  ],
  currentFYLabel: 'FY 2025-26',
  regimeOverride: null,
  preferredRegime: 'new',
  salaryIsNetOfTds: true,
} as TaxPlanningModel

const CUMULATIVE_TOTAL = 610_600

function renderAtWidth(width: number) {
  Object.defineProperty(globalThis.window, 'innerWidth', { value: width, configurable: true })
  return render(<TaxYearChart planning={planning} />)
}

/** Labels of the right-hand (cumulative) scale: the only SVG text anchored at its start. */
const rightScaleLabels = (container: HTMLElement) => container.querySelectorAll('svg text[text-anchor="start"]')

/** Plot y of the cumulative line's last point, the latest fiscal year and its highest total. */
function cumulativePeakY(container: HTMLElement): number | null {
  const d = container.querySelector('path[stroke-dasharray="4 4"]')?.getAttribute('d') ?? ''
  const end = /(-?[\d.]+),(-?[\d.]+)$/.exec(d)
  return end ? Number(end[2]) : null
}

describe('TaxYearChart', () => {
  const originalWidth = globalThis.window.innerWidth
  const originalMode = useMotionStore.getState().mode

  // Reduced motion paints final geometry at once, so the path is the settled line.
  beforeEach(() => useMotionStore.getState().setMode('reduced'))
  afterEach(() => {
    // Unmount first, so restoring the motion mode does not re-render a mounted chart.
    cleanup()
    Object.defineProperty(globalThis.window, 'innerWidth', { value: originalWidth, configurable: true })
    useMotionStore.getState().setMode(originalMode)
  })

  it('keeps the cumulative right scale compact and accessible at 320px', () => {
    const { container } = renderAtWidth(320)

    expect(
      screen.getByRole('img', {
        name: /Cumulative tax uses the right scale from ₹0\.00 to ₹6,10,600\.00/,
      }),
    ).toBeInTheDocument()

    const scale = screen.getByText('Cumulative: ₹0-₹6.1L')
    expect(scale).toHaveClass('min-w-0', 'truncate')
    expect(scale.parentElement).toHaveClass('min-w-0', 'max-w-full')

    // The right scale is hidden, gives its margin back, and spans exactly 0 to the total,
    // so the line peaks at the plot top as the caption's stated range says.
    const layout = taxYearChartLayout(true, CUMULATIVE_TOTAL)
    expect(layout).toMatchObject({ hideRightAxis: true, margin: { right: 8 }, value2Domain: [0, CUMULATIVE_TOTAL] })
    expect(rightScaleLabels(container)).toHaveLength(0)
    expect(cumulativePeakY(container)).toBe(layout.margin.top)
    expect(screen.getByText('24-25')).toBeInTheDocument()
  })

  it('shows the rounded cumulative scale beside the plot on wider screens', () => {
    const { container } = renderAtWidth(1024)

    const layout = taxYearChartLayout(false, CUMULATIVE_TOTAL)
    expect(layout.hideRightAxis).toBe(false)
    expect(layout.value2Domain).toBeUndefined()
    expect(rightScaleLabels(container).length).toBeGreaterThan(0)
    expect(cumulativePeakY(container)).toBeGreaterThan(layout.margin.top)
    expect(screen.getByText('FY 2024-25', { selector: 'svg text' })).toBeInTheDocument()
  })

  it('shortens two-year fiscal labels for phones', () => {
    expect(shortFyLabel('FY 2024-25')).toBe('24-25')
    expect(shortFyLabel('FY 2024')).toBe('2024')
  })
})
