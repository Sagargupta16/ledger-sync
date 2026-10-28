import { useMemo } from 'react'

import { DataTable, type DataTableColumn } from '@/components/ui'

import { valueFormatter } from '../chartFormat'
import type { ChartLink, ChartRow, ChartSpec } from '../chartSpec'
import { waterfallSteps } from '../waterfall'

const TABLE_PROPS = { stickyHeader: true, maxHeightClass: 'max-h-72', mobileCards: true } as const

function LinksTable({ spec }: Readonly<{ spec: ChartSpec }>) {
  const format = valueFormatter(spec.valueFormat)
  const columns: DataTableColumn<ChartLink>[] = [
    { key: 'from', header: 'From', align: 'left', sortType: 'text', sortable: true, mobilePrimary: true, cell: (link) => link.from },
    { key: 'to', header: 'To', align: 'left', sortType: 'text', sortable: true, cell: (link) => link.to },
    { key: 'value', header: 'Value', align: 'right', sortable: true, cell: (link) => format(link.value) },
  ]
  return (
    <DataTable
      columns={columns}
      rows={spec.links ?? []}
      rowKey={(link) => `${link.from}>${link.to}`}
      ariaLabel={`${spec.title} flows`}
      {...TABLE_PROPS}
    />
  )
}

/** Columnar values as rows; a waterfall also gets its computed Net row. */
function ValuesTable({ spec }: Readonly<{ spec: ChartSpec }>) {
  const rows = useMemo<readonly ChartRow[]>(() => {
    if (spec.chartType !== 'waterfall') return spec.data
    const net = waterfallSteps(spec).at(-1)
    return net ? [...spec.data, { [spec.xKey]: net.label, [spec.series[0].key]: net.change }] : spec.data
  }, [spec])
  const columns = useMemo<DataTableColumn<ChartRow>[]>(() => {
    const format = valueFormatter(spec.valueFormat)
    return [
      {
        key: spec.xKey,
        header: spec.xLabel,
        align: 'left',
        sortType: 'text',
        sortable: true,
        mobilePrimary: true,
        mobileLabel: '',
        cell: (row) => String(row[spec.xKey]),
      },
      ...spec.series.map<DataTableColumn<ChartRow>>((series) => ({
        key: series.key,
        header: series.label,
        align: 'right',
        sortable: true,
        cell: (row) => format(Number(row[series.key])),
      })),
    ]
  }, [spec])
  return (
    <DataTable
      columns={columns}
      rows={rows}
      rowKey={(row) => String(row[spec.xKey])}
      ariaLabel={`${spec.title} values`}
      {...TABLE_PROPS}
    />
  )
}

/** The chart's exact values as a table: the numbers the assistant passed, nothing derived but a waterfall's Net. */
export default function CanvasChartTable({ spec }: Readonly<{ spec: ChartSpec }>) {
  return spec.chartType === 'sankey' ? <LinksTable spec={spec} /> : <ValuesTable spec={spec} />
}
