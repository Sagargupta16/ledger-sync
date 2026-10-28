import { memo, useMemo } from 'react'

import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { CHART_COLORS, SEMANTIC_COLORS } from '@/constants'

import { tickFormatter, valueFormatter } from '../chartFormat'
import type { ChartSpec } from '../chartSpec'
import { seriesColors, type CanvasChartProps } from './canvasColors'
import CartesianCanvasChart from './CartesianCanvasChart'
import ComboCanvasChart from './ComboCanvasChart'
import FlowCanvasChart from './FlowCanvasChart'
import HeatmapChart from './HeatmapChart'
import PartsCanvasChart from './PartsCanvasChart'
import ScatterChart from './ScatterChart'
import WaterfallChart from './WaterfallChart'

/** One canvas chart: picks the renderer for its family and hands it colours and formats. */
function CanvasChart({ spec }: Readonly<{ spec: ChartSpec }>) {
  const palette = usePaletteSnapshot(CHART_COLORS)
  const semantic = usePaletteSnapshot(SEMANTIC_COLORS)
  const colors = useMemo(() => seriesColors(spec.series, palette, semantic), [spec.series, palette, semantic])
  const props: CanvasChartProps = {
    colors,
    palette,
    semantic,
    format: valueFormatter(spec.valueFormat),
    ticks: tickFormatter(spec.valueFormat),
    ariaLabel: spec.subtitle ? `${spec.title}. ${spec.subtitle}` : spec.title,
  }

  switch (spec.chartType) {
    case 'combo':
      return <ComboCanvasChart spec={spec} {...props} />
    case 'pie':
    case 'donut':
    case 'radar':
    case 'treemap':
      return <PartsCanvasChart spec={spec} {...props} />
    case 'sankey':
    case 'slope':
      return <FlowCanvasChart spec={spec} {...props} />
    case 'scatter':
      return <ScatterChart spec={spec} {...props} />
    case 'heatmap':
      return <HeatmapChart spec={spec} {...props} />
    case 'waterfall':
      return <WaterfallChart spec={spec} {...props} />
    default:
      return <CartesianCanvasChart spec={spec} {...props} />
  }
}

export default memo(CanvasChart)
