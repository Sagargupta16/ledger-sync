/**
 * Layout decisions for the tax-per-year chart, kept pure so tests can check
 * them without measuring an SVG.
 */

/** Phones hide the cumulative right scale, so the plot takes its room back. */
const PHONE_MARGIN = { top: 16, right: 8 } as const
/** Room for the right scale's compact currency labels, such as ₹1.2Cr. */
const DESKTOP_MARGIN = { top: 16, right: 56 } as const

export interface TaxYearChartLayout {
  readonly margin: { readonly top: number; readonly right: number }
  readonly hideRightAxis: boolean
  /**
   * Exact 0-to-total range on phones, so the line peaks at the plot top and
   * matches the scale the caption states; undefined keeps the rounded scale.
   */
  readonly value2Domain?: readonly [number, number]
}

export function taxYearChartLayout(isMobile: boolean, cumulativeTaxMax: number): TaxYearChartLayout {
  if (!isMobile) return { margin: DESKTOP_MARGIN, hideRightAxis: false }
  return { margin: PHONE_MARGIN, hideRightAxis: true, value2Domain: [0, cumulativeTaxMax] }
}

/** 'FY 2024-25' as '24-25' for a crowded phone axis; other labels only lose the FY prefix. */
export function shortFyLabel(fy: string): string {
  const label = fy.replace(/^FY\s*/i, '')
  const span = /^\d{2}(\d{2})-(\d{2})$/.exec(label)
  return span ? `${span[1]}-${span[2]}` : label
}
