// Characters that make a spreadsheet treat a cell as a formula. A cell that
// starts with one of these (from imported, user-controlled data) could execute
// on open -- CSV/formula injection. Neutralize by prefixing a single quote.
const FORMULA_TRIGGERS = ['=', '+', '-', '@', '\t', '\r']

function escapeCsvValue(val: string | number): string {
  let str = String(val)
  if (str.length > 0 && FORMULA_TRIGGERS.includes(str[0])) {
    // Prefix with a single quote so Excel/Sheets treat it as text, and force
    // quoting so the leading apostrophe survives the CSV round-trip.
    str = `'${str}`
    return '"' + str.replaceAll('"', '""') + '"'
  }
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replaceAll('"', '""') + '"'
  }
  return str
}

export function exportChartAsCsv(
  filename: string,
  columns: string[],
  chartData: Array<Record<string, number | string>>,
) {
  const header = ['Period', ...columns].map(escapeCsvValue).join(',')
  const csvRows = [header]
  chartData.forEach((entry) => {
    const values = columns.map((c) => escapeCsvValue(entry[c] ?? 0))
    csvRows.push(escapeCsvValue(entry.displayPeriod ?? '') + ',' + values.join(','))
  })
  // UTF-8 BOM for Excel compatibility
  const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
