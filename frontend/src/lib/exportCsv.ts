export function exportChartAsCsv(
  filename: string,
  columns: string[],
  chartData: Array<Record<string, number | string>>,
) {
  const csvRows = ['Period,' + columns.join(',')]
  chartData.forEach((entry) => {
    const values = columns.map((c) => entry[c] ?? 0)
    csvRows.push(entry.displayPeriod + ',' + values.join(','))
  })
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
