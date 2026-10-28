import { useMemo } from 'react'

import SankeyDiagram from '@/components/charts/SankeyDiagram'
import SlopeChart from '@/components/charts/SlopeChart'
import { chartDataTable } from '@/components/ui/chartDataTable'

import type { ChartLink, ChartRow, ChartSpec } from '../chartSpec'
import { CANVAS_CHART_HEIGHT, type CanvasChartProps } from './canvasColors'

type Props = CanvasChartProps & { readonly spec: ChartSpec }

const SPENDING = /expense|spend|spent|cost|bill|debt|loan|tax/i

function SankeyPart({ spec, palette, format, ariaLabel }: Props) {
  const links = useMemo(() => spec.links ?? [], [spec.links])
  const diagram = useMemo(() => {
    const names = [...new Set(links.flatMap((link) => [link.from, link.to]))]
    return {
      nodes: names.map((name, index) => ({ id: name, label: name, color: palette[index % palette.length] })),
      links: links.map((link) => ({ source: link.from, target: link.to, value: link.value })),
    }
  }, [links, palette])
  // Room for every node's label: the busiest column sets the height.
  const height = Math.min(560, Math.max(CANVAS_CHART_HEIGHT, diagram.nodes.length * 30 + 80))
  return (
    <>
      <SankeyDiagram nodes={diagram.nodes} links={diagram.links} ariaLabel={ariaLabel} height={height} formatValue={format} />
      {chartDataTable<ChartLink>(
        links,
        [
          { header: 'From', rowHeader: true, value: (link) => link.from },
          { header: 'To', value: (link) => link.to },
          { header: 'Value', value: (link) => format(link.value) },
        ],
        ariaLabel,
        (link) => `${link.from}>${link.to}`,
      )}
    </>
  )
}

function SlopePart({ spec, format, ariaLabel }: Props) {
  const [start, end] = spec.series
  const data = useMemo(
    () =>
      spec.data.map((row) => ({
        key: String(row[spec.xKey]),
        label: String(row[spec.xKey]),
        start: Number(row[start.key]),
        end: Number(row[end.key]),
      })),
    [spec.data, spec.xKey, start.key, end.key],
  )
  const direction = SPENDING.test(`${spec.title} ${start.label} ${end.label}`) ? 'spending' : 'income'
  return (
    <>
      <SlopeChart
        data={data}
        startLabel={start.label}
        endLabel={end.label}
        direction={direction}
        formatValue={format}
        ariaLabel={ariaLabel}
      />
      {chartDataTable<ChartRow>(
        spec.data,
        [
          { header: spec.xLabel, rowHeader: true, value: (row) => String(row[spec.xKey]) },
          { header: start.label, value: (row) => format(Number(row[start.key])) },
          { header: end.label, value: (row) => format(Number(row[end.key])) },
        ],
        ariaLabel,
        (row) => String(row[spec.xKey]),
      )}
    </>
  )
}

/** Flows between things (sankey) and each item between two periods (slope). */
export default function FlowCanvasChart(props: Props) {
  return props.spec.chartType === 'sankey' ? <SankeyPart {...props} /> : <SlopePart {...props} />
}
