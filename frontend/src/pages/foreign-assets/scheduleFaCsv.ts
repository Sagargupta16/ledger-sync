import type { ScheduleFaReport, ScheduleFaRow } from '@/services/api/rsuTax'

import { flagLabels } from './foreignAssetsLabels'

// A text cell starting with one of these could run as a formula when opened.
const FORMULA_TRIGGERS = new Set(['=', '+', '-', '@', '\t', '\r'])

function cell(value: string | number | null | undefined): string {
  if (value == null) return ''
  let text = String(value)
  if (typeof value === 'string' && text.length > 0 && FORMULA_TRIGGERS.has(text[0])) text = `'${text}`
  return /[",\n\r]/.test(text) || text.startsWith("'") ? `"${text.replaceAll('"', '""')}"` : text
}

const line = (values: Array<string | number | null | undefined>) => values.map(cell).join(',')

/** Table A3 columns in the form's order, then the worksheet figures behind them. */
const HEADER = [
  'Sl No', 'Country', 'Name of entity', 'Address of entity', 'ZIP code', 'Nature of entity',
  'Date of acquiring the interest', 'Initial value of the investment (INR)',
  'Peak value of investment during the period (INR)', 'Closing value (INR)',
  'Total gross amount paid or credited during the period (INR)',
  'Total gross proceeds from sale or redemption during the period (INR)',
  'Symbol', 'Currency', 'Shares at start', 'Shares at end', 'Peak date', 'Peak value (currency)',
  'Rate for peak (INR per unit)', 'Closing price date', 'Closing value (currency)',
  'Rate for closing (INR per unit)', 'Dividends (currency)', 'Foreign tax withheld (currency)',
  'Foreign tax withheld (INR)', 'Sale proceeds (currency)', 'Lot cost source', 'Notes',
]

function rowValues(row: ScheduleFaRow, index: number) {
  return [
    index + 1, row.country, row.entity_name, '', '', row.nature, row.acquired_on,
    row.initial_value_inr, row.peak_value_inr, row.closing_value_inr, row.dividends_inr,
    row.sale_proceeds_inr, row.symbol, row.currency, row.shares_at_start, row.shares_at_end,
    row.peak_date, row.peak_value_quote, row.peak_rate, row.closing_price_date,
    row.closing_value_quote, row.closing_rate, row.dividends_quote, row.tax_withheld_quote,
    row.tax_withheld_inr, row.sale_proceeds_quote, row.fx_source, flagLabels(row.flags).join('; '),
  ]
}

export function scheduleFaCsv(report: ScheduleFaReport): string {
  const period = `Period ${report.period_start} to ${report.period_end}${report.in_progress ? ' (year in progress)' : ''}`
  const lines = [
    line([`Schedule FA worksheet, Table A3 (foreign equity interest): ${report.return_label}`]),
    line([period]),
    line([`Peak and closing values: ${report.rate_basis}. Sales and dividends use the SBI TT buying rate entered for them, else the ECB rate of the day.`]),
    line(['A computation aid, not tax advice. Add each entity address and ZIP code, and confirm every figure with a CA before filing.']),
    // Records the worksheet could not place (unlinked sales, dividends with no holder) stay visible in the file.
    ...report.warnings.map((warning) => line([`Note: ${warning}`])),
    '',
    line(HEADER),
    ...report.rows.map((row, index) => line(rowValues(row, index))),
    line([
      'Total', '', '', '', '', '', '', report.totals.initial_value_inr, '', report.totals.closing_value_inr,
      report.totals.dividends_inr, report.totals.sale_proceeds_inr,
    ]),
  ]
  return lines.join('\r\n')
}

/** Save the worksheet as a CSV the way the other exports do (UTF-8 with a BOM for Excel). */
export function downloadScheduleFaCsv(report: ScheduleFaReport): void {
  const blob = new Blob([`\uFEFF${scheduleFaCsv(report)}`], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `schedule-fa-cy${report.calendar_year}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}
