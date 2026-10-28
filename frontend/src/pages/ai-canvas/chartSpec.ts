/**
 * What the AI Canvas draws, and the validator that turns `render_chart`
 * arguments (schema in renderChartTool.ts) into a chart.
 *
 * The tool runs in the browser, not on the server: the model fetches numbers
 * with the server's read-only data tools (or calculates them, when asked), then
 * passes them here. Arguments that do not fit return an error the model can
 * read and correct, so nothing malformed reaches a chart.
 *
 * The arguments are columns (one `labels` list, one `values` list per series)
 * rather than row objects, because the model writes them inside a reply capped
 * at 1024 output tokens: repeating every field name per row roughly doubled a
 * chart's cost. The spec turns them back into the rows the chart kit reads. A
 * sankey takes `links` instead.
 */

import {
  ChartArgError, fail, oneOf, optionalText, parseLabels, parseLinks, parseSeries, text, type RawSeries,
} from './chartParse'

export const CHART_TYPES = [
  'bar', 'stacked_bar', 'horizontal_bar', 'line', 'area', 'stacked_area', 'combo', 'pie', 'donut',
  'radar', 'treemap', 'sankey', 'slope', 'scatter', 'heatmap', 'waterfall',
] as const
export type ChartType = (typeof CHART_TYPES)[number]

export const VALUE_FORMATS = ['currency', 'number', 'percent'] as const
export type ValueFormat = (typeof VALUE_FORMATS)[number]

/** Where the numbers came from; the card says so. */
export const CHART_SOURCES = ['ledger', 'calculated', 'estimate'] as const
export type ChartSource = (typeof CHART_SOURCES)[number]

export const CHART_LIMITS = {
  title: 80,
  subtitle: 160,
  label: 60,
  sourceNote: 200,
  series: 6,
  heatmapColumns: 12,
  rows: 60,
  pieRows: 7,
  links: 40,
  nodes: 30,
} as const

/** Row field holding each label; series values sit under `s1`, `s2` and so on. */
export const X_KEY = 'label'

export interface ChartSeries {
  readonly key: string
  readonly label: string
  /** Combo only: drawn as bars or a line. */
  readonly kind?: 'bar' | 'line'
  /** Combo only: the right axis, for a rate over amounts. */
  readonly axis?: 'left' | 'right'
}

export interface ChartLink {
  readonly from: string
  readonly to: string
  readonly value: number
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
  /** Empty for a sankey, which draws `links`. */
  readonly data: readonly ChartRow[]
  readonly links?: readonly ChartLink[]
  readonly valueFormat: ValueFormat
  readonly source: ChartSource
  /** What was used or assumed, e.g. "12% a year, monthly compounding". */
  readonly sourceNote?: string
}

export interface CanvasChart {
  readonly id: string
  readonly spec: ChartSpec
  /** The request that produced it, shown on the card. */
  readonly prompt: string
  readonly createdAt: string
  /** The data look-ups before it was drawn, in words (canvasSteps.ts). */
  readonly sources: readonly string[]
}

export const MAX_SOURCES = 8
export const MAX_SOURCE_LENGTH = 240

export type ParseResult = { ok: true; spec: ChartSpec } | { ok: false; error: string }

interface Rule {
  readonly rows: readonly [number, number]
  readonly series: readonly [number, number]
  /** Said after "takes at most N" when there are too many labels. */
  readonly tooMany?: string
  readonly check?: (series: readonly RawSeries[]) => void
}

const OTHER_HINT = '; keep the largest and fold the rest into "Other"'

function partsOfWhole(what: string) {
  return (series: readonly RawSeries[]) => {
    const { values } = series[0]
    if (values.some((value) => value < 0)) fail(`${what} cannot show negative values; use bar or waterfall instead`)
    if (!values.some((value) => value > 0)) fail(`${what} needs at least one value above zero`)
  }
}

function checkCombo(series: readonly RawSeries[]): void {
  if (series.some((entry) => !entry.kind)) fail('every combo series needs kind: bar or line')
  if (!series.some((entry) => entry.kind === 'bar') || !series.some((entry) => entry.kind === 'line')) {
    fail('a combo needs at least one bar series and one line series; use bar or line for a single kind')
  }
}

function checkRadar(series: readonly RawSeries[]): void {
  if (series[0].values.some((value) => value < 0 || value > 100)) {
    fail('radar values must be 0 to 100; convert them to percentages (for example of the largest value or of a target) first')
  }
}

/** A final step equal to everything before it is the total itself, which the chart already adds as Net. */
function checkWaterfall(series: readonly RawSeries[]): void {
  const { values } = series[0]
  if (values.length < 2) return
  const before = values.slice(0, -1).reduce((sum, value) => sum + value, 0)
  if (Math.abs((values.at(-1) ?? 0) - before) < 1) {
    fail('the last step equals the running total (a savings, net or closing figure); drop it, the waterfall adds the Net bar itself')
  }
}

const FLAT: Rule = { rows: [1, CHART_LIMITS.rows], series: [1, CHART_LIMITS.series] }

const RULES: Record<Exclude<ChartType, 'sankey'>, Rule> = {
  bar: FLAT,
  stacked_bar: FLAT,
  horizontal_bar: FLAT,
  line: FLAT,
  area: FLAT,
  stacked_area: FLAT,
  combo: { rows: [1, CHART_LIMITS.rows], series: [2, CHART_LIMITS.series], check: checkCombo },
  pie: { rows: [1, CHART_LIMITS.pieRows], series: [1, 1], tooMany: OTHER_HINT, check: partsOfWhole('a pie') },
  donut: { rows: [1, CHART_LIMITS.pieRows], series: [1, 1], tooMany: OTHER_HINT, check: partsOfWhole('a donut') },
  radar: { rows: [3, 12], series: [1, 1], check: checkRadar },
  treemap: { rows: [2, 40], series: [1, 1], tooMany: OTHER_HINT, check: partsOfWhole('a treemap') },
  slope: { rows: [2, 12], series: [2, 2] },
  scatter: { rows: [2, CHART_LIMITS.rows], series: [2, 2] },
  heatmap: { rows: [1, 24], series: [1, CHART_LIMITS.heatmapColumns] },
  waterfall: { rows: [1, 24], series: [1, 1], check: checkWaterfall },
}

const SERIES_WHAT: Partial<Record<ChartType, string>> = {
  slope: 'a slope (start, then end)',
  scatter: 'a scatter (x, then y)',
  heatmap: 'a heatmap (one series per column)',
}

function common(input: Record<string, unknown>) {
  const subtitle = optionalText(input.subtitle, 'subtitle', CHART_LIMITS.subtitle)
  const sourceNote = optionalText(input.source_note, 'source_note', CHART_LIMITS.sourceNote)
  return {
    title: text(input.title, 'title', CHART_LIMITS.title),
    ...(subtitle ? { subtitle } : {}),
    xKey: X_KEY,
    xLabel: optionalText(input.x_label, 'x_label', CHART_LIMITS.label) ?? 'Label',
    valueFormat: input.value_format === undefined ? 'currency' : oneOf(input.value_format, VALUE_FORMATS, 'value_format'),
    source: input.source === undefined ? 'ledger' : oneOf(input.source, CHART_SOURCES, 'source'),
    ...(sourceNote ? { sourceNote } : {}),
  } as const
}

function columnar(input: Record<string, unknown>, chartType: Exclude<ChartType, 'sankey'>) {
  const rule = RULES[chartType]
  const labels = parseLabels(input.labels, rule.rows[0], rule.rows[1], CHART_LIMITS.label, rule.tooMany ?? '')
  const raw = parseSeries(input.series, labels.length, {
    min: rule.series[0],
    max: rule.series[1],
    labelMax: CHART_LIMITS.label,
    what: SERIES_WHAT[chartType] ?? `a ${chartType.replaceAll('_', ' ')} chart`,
  })
  rule.check?.(raw)
  const combo = chartType === 'combo'
  const series = raw.map(({ label, kind, axis }, index) => ({
    key: `s${index + 1}`,
    label,
    ...(combo && kind ? { kind } : {}),
    ...(combo && axis ? { axis } : {}),
  }))
  const data = labels.map((label, row) => {
    const entry: Record<string, string | number> = { [X_KEY]: label }
    raw.forEach(({ values }, index) => {
      entry[series[index].key] = values[row]
    })
    return entry
  })
  return { series, data }
}

/** Validate `render_chart` arguments; the error text is written for the model to act on. */
export function parseChartArgs(input: Record<string, unknown>): ParseResult {
  try {
    const chartType = oneOf(input.chart_type, CHART_TYPES, 'chart_type')
    const base = common(input)
    if (chartType === 'sankey') {
      const links = parseLinks(input.links, { max: CHART_LIMITS.links, maxNodes: CHART_LIMITS.nodes, labelMax: CHART_LIMITS.label })
      return { ok: true, spec: { ...base, chartType, series: [], data: [], links } }
    }
    return { ok: true, spec: { ...base, chartType, ...columnar(input, chartType) } }
  } catch (error) {
    if (error instanceof ChartArgError) return { ok: false, error: error.message }
    throw error
  }
}

/** The tool arguments that rebuild *spec*, so a stored chart is validated again on load. */
export function chartArgs(spec: ChartSpec): Record<string, unknown> {
  const args: Record<string, unknown> = {
    title: spec.title,
    subtitle: spec.subtitle,
    chart_type: spec.chartType,
    x_label: spec.xLabel,
    value_format: spec.valueFormat,
    source: spec.source,
    source_note: spec.sourceNote,
  }
  if (spec.chartType === 'sankey') return { ...args, links: (spec.links ?? []).map((link) => ({ ...link })) }
  return {
    ...args,
    labels: spec.data.map((row) => row[spec.xKey]),
    series: spec.series.map(({ key, label, kind, axis }) => ({
      label,
      values: spec.data.map((row) => row[key]),
      ...(kind ? { kind } : {}),
      ...(axis ? { axis } : {}),
    })),
  }
}
