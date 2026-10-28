import { useMemo } from 'react'

import { DataTable, type DataTableColumn } from '@/components/ui'

import { valueFormatter } from '../chartFormat'
import type { ChartRow, ChartSpec } from '../chartSpec'

/** The chart's exact values as a table: the numbers the assistant passed, nothing derived. */
export default function CanvasChartTable({ spec }: Readonly<{ spec: ChartSpec }>) {
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
      rows={spec.data}
      rowKey={(row) => String(row[spec.xKey])}
      ariaLabel={`${spec.title} values`}
      stickyHeader
      maxHeightClass="max-h-72"
      mobileCards
    />
  )
}
