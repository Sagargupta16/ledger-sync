/**
 * What the AI Canvas draws, and the validator that turns `render_chart`
 * arguments (schema in renderChartTool.ts) into a chart.
 *
 * The tool runs in the browser, not on the server: the model fetches numbers
 * with the server's read-only data tools, then passes them here. Arguments that
 * do not fit return an error the model can read and correct, so nothing
 * malformed reaches a chart.
 *
 * The arguments are columns (one `labels` list, one `values` list per series)
 * rather than row objects, because the model writes them inside a reply capped
 * at 1024 output tokens: repeating every field name per row roughly doubled a
 * chart's cost. The spec turns them back into the rows the chart kit reads.
 */

export const CHART_TYPES = ['bar', 'horizontal_bar', 'line', 'area', 'pie'] as const
export type ChartType = (typeof CHART_TYPES)[number]

export const VALUE_FORMATS = ['currency', 'number', 'percent'] as const
export type ValueFormat = (typeof VALUE_FORMATS)[number]

export const CHART_LIMITS = {
  title: 80,
  subtitle: 160,
  label: 60,
  series: 4,
  rows: 60,
  pieRows: 7,
} as const

/** Row field holding each label; series values sit under `s1` to `s4`. */
export const X_KEY = 'label'

export interface ChartSeries {
  readonly key: string
  readonly label: string
}

export type ChartRow = Readonly<Record<string, string | number>>

export interface ChartSpec {
  readonly title: string
  readonly subtitle?: string
  readonly chartType: ChartType
  /** Row field holding each category or period label (always X_KEY). */
  readonly xKey: string
  /** What the labels are, e.g. "Month"; heads the screen-reader table. */
  readonly xLabel: string
  readonly series: readonly ChartSeries[]
  readonly data: readonly ChartRow[]
  readonly valueFormat: ValueFormat
}

export interface CanvasChart {
  readonly id: string
  readonly spec: ChartSpec
  /** The request that produced it, shown on the card. */
  readonly prompt: string
  readonly createdAt: string
}

export type ParseResult = { ok: true; spec: ChartSpec } | { ok: false; error: string }

class ChartArgError extends Error {}

function fail(message: string): never {
  throw new ChartArgError(message)
}

function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function text(value: unknown, field: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) fail(`${field} must be a non-empty string`)
  if (trimmed.length > max) fail(`${field} must be at most ${max} characters`)
  return trimmed
}

function optionalText(value: unknown, field: string, max: number): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : text(value, field, max)
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  return fail(`${field} must be one of ${allowed.join(', ')}`)
}

function toNumber(value: unknown, field: string): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) fail(`${field} must be a number`)
  return number
}

function parseLabels(value: unknown, maxRows: number): string[] {
  if (!Array.isArray(value) || value.length === 0) fail('labels must list at least one label')
  if (value.length > maxRows) fail(`labels has ${value.length} entries; this chart takes at most ${maxRows}`)
  const seen = new Set<string>()
  return value.map((entry: unknown, index) => {
    const label =
      typeof entry === 'number' && Number.isFinite(entry)
        ? String(entry)
        : text(entry, `labels[${index}]`, CHART_LIMITS.label)
    if (seen.has(label)) fail(`labels has "${label}" twice; each label must be unique`)
    seen.add(label)
    return label
  })
}

interface ParsedSeries {
  label: string
  values: number[]
}

function parseSeries(value: unknown, rows: number): ParsedSeries[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > CHART_LIMITS.series) {
    fail(`series must list 1 to ${CHART_LIMITS.series} entries`)
  }
  return value.map((entry: unknown, index) => {
    const item = asRecord(entry, `series[${index}]`)
    const label = text(item.label, `series[${index}].label`, CHART_LIMITS.label)
    if (!Array.isArray(item.values) || item.values.length !== rows) {
      fail(`series[${index}].values must hold ${rows} numbers, one per label`)
    }
    const values = item.values.map((v: unknown, at) => toNumber(v, `series[${index}].values[${at}]`))
    return { label, values }
  })
}

function checkPie(series: readonly ParsedSeries[]): void {
  if (series.length !== 1) fail('a pie takes exactly one series')
  const { values } = series[0]
  if (values.some((value) => value < 0)) fail('a pie cannot show negative values; use bar instead')
  if (!values.some((value) => value > 0)) fail('a pie needs at least one value above zero')
}

/** Validate `render_chart` arguments; the error text is written for the model to act on. */
export function parseChartArgs(input: Record<string, unknown>): ParseResult {
  try {
    const chartType = oneOf(input.chart_type, CHART_TYPES, 'chart_type')
    const isPie = chartType === 'pie'
    if (isPie && Array.isArray(input.labels) && input.labels.length > CHART_LIMITS.pieRows) {
      fail(`a pie takes at most ${CHART_LIMITS.pieRows} slices; use horizontal_bar for a longer ranking`)
    }
    const labels = parseLabels(input.labels, isPie ? CHART_LIMITS.pieRows : CHART_LIMITS.rows)
    const parsed = parseSeries(input.series, labels.length)
    if (isPie) checkPie(parsed)
    const series = parsed.map(({ label }, index) => ({ key: `s${index + 1}`, label }))
    const data = labels.map((label, row) => {
      const entry: Record<string, string | number> = { [X_KEY]: label }
      parsed.forEach(({ values }, index) => {
        entry[series[index].key] = values[row]
      })
      return entry
    })
    const subtitle = optionalText(input.subtitle, 'subtitle', CHART_LIMITS.subtitle)
    const valueFormat =
      input.value_format === undefined ? 'currency' : oneOf(input.value_format, VALUE_FORMATS, 'value_format')
    const spec: ChartSpec = {
      title: text(input.title, 'title', CHART_LIMITS.title),
      ...(subtitle ? { subtitle } : {}),
      chartType,
      xKey: X_KEY,
      xLabel: optionalText(input.x_label, 'x_label', CHART_LIMITS.label) ?? 'Label',
      series,
      data,
      valueFormat,
    }
    return { ok: true, spec }
  } catch (error) {
    if (error instanceof ChartArgError) return { ok: false, error: error.message }
    throw error
  }
}

/** The tool arguments that rebuild *spec*, so a stored chart is validated again on load. */
export function chartArgs(spec: ChartSpec): Record<string, unknown> {
  return {
    title: spec.title,
    subtitle: spec.subtitle,
    chart_type: spec.chartType,
    x_label: spec.xLabel,
    labels: spec.data.map((row) => row[spec.xKey]),
    series: spec.series.map(({ key, label }) => ({ label, values: spec.data.map((row) => row[key]) })),
    value_format: spec.valueFormat,
  }
}
