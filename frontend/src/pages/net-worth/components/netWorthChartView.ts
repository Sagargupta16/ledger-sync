import type { MilestoneRow, NetWorthPoint } from '../netWorthProjection'

export type NetWorthChartRow = Record<string, number | string | [number, number] | null>

export interface NetWorthTrendChartProps {
  isLoading: boolean
  filteredNetWorthData: Array<Record<string, number | string>>
  chartData: NetWorthChartRow[]
  allCategories: string[]
  showStacked: boolean
  setShowStacked: (v: boolean) => void
  showProjection: boolean
  setShowProjection: (v: boolean) => void
  /** Average monthly net-worth change in rupees (linear model over cash flows). */
  monthlyGrowth: number
  anchor: NetWorthPoint | null
  /**
   * Upcoming milestones to draw as horizontal threshold lines so users see
   * "I'll cross 1Cr around month X". Only ``status === 'upcoming'`` rows
   * are rendered; achieved milestones are already visible as the line
   * crossing them. The chart skips a line outside the visible value domain,
   * so a milestone beyond it simply does not draw.
   */
  milestoneRows?: readonly MilestoneRow[]
}

export function getNetWorthChartView({
  chartData,
  filteredNetWorthData,
  showStacked,
  showProjection,
}: Readonly<NetWorthTrendChartProps>) {
  // Stacked view splits net worth into category proportions of a POSITIVE total;
  // when cumulative net worth is negative those proportions collapse to a flat
  // zero line (meaningless). Disable the stacked toggle for windows that dip
  // negative and fall back to the total view.
  const hasNegativeNetWorth = chartData.some((d) => typeof d.netWorth === 'number' && d.netWorth < 0)
  const stackedAllowed = !hasNegativeNetWorth
  const effectiveStacked = showStacked && stackedAllowed
  // Projection rows contain totals only. A category view must use the original
  // historical rows, otherwise enabling both controls erases every category.
  const plotData = effectiveStacked && showProjection ? filteredNetWorthData : chartData

  return { stackedAllowed, effectiveStacked, plotData }
}
