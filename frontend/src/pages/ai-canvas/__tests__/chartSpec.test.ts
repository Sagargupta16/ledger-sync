import { describe, expect, it } from 'vitest'

import { chartArgs, CHART_TYPES, parseChartArgs } from '@/pages/ai-canvas/chartSpec'
import { followUps } from '@/pages/ai-canvas/chartFormat'
import { RENDER_CHART_TOOL } from '@/pages/ai-canvas/renderChartTool'
import { waterfallSteps } from '@/pages/ai-canvas/waterfall'

const monthly = {
  title: 'Income vs spending',
  chart_type: 'bar',
  x_label: 'Month',
  labels: ['2026-04', '2026-05'],
  series: [
    { label: 'Income', values: [120000, '118000'] },
    { label: 'Spending', values: [84000, 91000.5] },
  ],
}

const one = (values: number[], label = 'Value') => [{ label, values }]
const labels = (count: number, prefix = 'L') => Array.from({ length: count }, (_, index) => `${prefix}${index}`)
const ones = (count: number) => Array.from({ length: count }, () => 1)

function errorOf(input: Record<string, unknown>): string {
  const result = parseChartArgs(input)
  if (result.ok) throw new Error('expected the arguments to be rejected')
  return result.error
}

function specOf(input: Record<string, unknown>) {
  const result = parseChartArgs(input)
  if (!result.ok) throw new Error(result.error)
  return result.spec
}

describe('parseChartArgs', () => {
  it('turns columns into the rows the chart kit reads', () => {
    expect(specOf(monthly)).toEqual({
      title: 'Income vs spending',
      chartType: 'bar',
      xKey: 'label',
      xLabel: 'Month',
      series: [
        { key: 's1', label: 'Income' },
        { key: 's2', label: 'Spending' },
      ],
      data: [
        { label: '2026-04', s1: 120000, s2: 84000 },
        { label: '2026-05', s1: 118000, s2: 91000.5 },
      ],
      valueFormat: 'currency',
      source: 'ledger',
    })
  })

  it.each([
    [{ chart_type: 'candlestick' }, 'chart_type must be one of'],
    [{ title: '' }, 'title must be a non-empty string'],
    [{ title: 'x'.repeat(81) }, 'title must be at most 80'],
    [{ labels: [] }, 'labels must list at least one label'],
    [{ labels: ['Apr', 'Apr'] }, 'labels has "Apr" twice'],
    [{ series: [] }, 'takes 1 to 6 series'],
    [{ series: [{ label: 'Income', values: [1] }] }, 'must hold 2 numbers'],
    [{ series: [{ label: 'Income', values: [1, 'lots'] }] }, 'series[0].values[1] must be a number'],
    [{ series: [{ values: [1, 2] }] }, 'series[0].label must be a non-empty string'],
    [{ value_format: 'usd' }, 'value_format must be one of'],
    [{ source: 'guess' }, 'source must be one of'],
  ])('rejects %o', (patch, message) => {
    expect(errorOf({ ...monthly, ...patch })).toContain(message)
  })

  it('caps labels at 60', () => {
    expect(errorOf({ ...monthly, labels: labels(61), series: one(ones(61)) })).toContain('at most 60')
  })

  it('keeps where the numbers came from', () => {
    const spec = specOf({ ...monthly, source: 'calculated', source_note: '12% a year, monthly compounding' })
    expect(spec.source).toBe('calculated')
    expect(spec.sourceNote).toBe('12% a year, monthly compounding')
  })

  it('accepts stacked bars and areas with up to 6 series', () => {
    const six = Array.from({ length: 6 }, (_, index) => ({ label: `S${index}`, values: [1, 2] }))
    expect(specOf({ ...monthly, chart_type: 'stacked_bar', series: six }).series).toHaveLength(6)
    expect(specOf({ ...monthly, chart_type: 'stacked_area' }).chartType).toBe('stacked_area')
    expect(errorOf({ ...monthly, chart_type: 'stacked_bar', series: [...six, six[0]] })).toContain('1 to 6 series')
  })

  it('needs a bar and a line in a combo, each with its kind', () => {
    const combo = {
      ...monthly,
      chart_type: 'combo',
      series: [
        { label: 'Spending', values: [1, 2], kind: 'bar' },
        { label: 'Savings rate', values: [40, 45], kind: 'line', axis: 'right' },
      ],
    }
    expect(specOf(combo).series[1]).toEqual({ key: 's2', label: 'Savings rate', kind: 'line', axis: 'right' })
    expect(errorOf({ ...combo, series: [combo.series[0], { ...combo.series[1], kind: 'bar' }] })).toContain('one line series')
    expect(errorOf({ ...combo, series: [{ label: 'A', values: [1, 2] }, combo.series[1]] })).toContain('needs kind')
  })

  it('drops kind and axis outside a combo', () => {
    const spec = specOf({ ...monthly, series: [{ label: 'A', values: [1, 2], kind: 'line', axis: 'right' }] })
    expect(spec.series[0]).toEqual({ key: 's1', label: 'A' })
  })

  it.each(['pie', 'donut'])('holds a %s to one series, 7 slices and no negative values', (chartType) => {
    const pie = { title: 'Where it went', chart_type: chartType, labels: ['Food', 'Rent'], series: one([12000, 30000], 'Spent') }
    expect(parseChartArgs(pie).ok).toBe(true)
    expect(errorOf({ ...pie, series: monthly.series })).toContain('exactly 1 series')
    expect(errorOf({ ...pie, labels: labels(8), series: one(ones(8)) })).toContain('"Other"')
    expect(errorOf({ ...pie, series: one([-5, 1]) })).toContain('negative')
    expect(errorOf({ ...pie, series: one([0, 0]) })).toContain('above zero')
  })

  it('holds a radar to 3 to 12 axes of 0 to 100', () => {
    const radar = { title: 'Profile', chart_type: 'radar', labels: ['A', 'B', 'C'], series: one([10, 50, 100]) }
    expect(parseChartArgs(radar).ok).toBe(true)
    expect(errorOf({ ...radar, labels: ['A', 'B'], series: one([1, 2]) })).toContain('at least 3')
    expect(errorOf({ ...radar, series: one([10, 50, 120]) })).toContain('0 to 100')
  })

  it('takes a treemap of 2 to 40 non-negative parts', () => {
    const treemap = { title: 'Spend', chart_type: 'treemap', labels: ['A', 'B'], series: one([3, 4]) }
    expect(parseChartArgs(treemap).ok).toBe(true)
    expect(errorOf({ ...treemap, labels: ['A'], series: one([3]) })).toContain('at least 2')
    expect(errorOf({ ...treemap, series: one([3, -1]) })).toContain('negative')
  })

  it('draws a sankey from links only, one way', () => {
    const sankey = {
      title: 'Flow',
      chart_type: 'sankey',
      links: [
        { from: 'Salary', to: 'Rent', value: 30000 },
        { from: 'Salary', to: 'Savings', value: 50000 },
      ],
    }
    expect(specOf(sankey)).toMatchObject({ chartType: 'sankey', series: [], data: [], links: sankey.links })
    expect(errorOf({ ...sankey, links: [] })).toContain('needs links')
    expect(errorOf({ ...sankey, links: [{ from: 'A', to: 'A', value: 1 }] })).toContain('to itself')
    expect(errorOf({ ...sankey, links: [{ from: 'A', to: 'B', value: 0 }] })).toContain('above zero')
    expect(
      errorOf({ ...sankey, links: [{ from: 'A', to: 'B', value: 1 }, { from: 'B', to: 'C', value: 1 }, { from: 'C', to: 'A', value: 1 }] }),
    ).toContain('cycle (A to B to C to A)')
    expect(errorOf({ ...sankey, links: [sankey.links[0], sankey.links[0]] })).toContain('twice')
  })

  it.each([
    ['slope', 'a slope (start, then end) takes exactly 2 series'],
    ['scatter', 'a scatter (x, then y) takes exactly 2 series'],
  ])('needs exactly two series for a %s', (chartType, message) => {
    const two = { title: 'T', chart_type: chartType, labels: ['A', 'B'], series: [{ label: 'X', values: [1, 2] }, { label: 'Y', values: [3, 4] }] }
    expect(parseChartArgs(two).ok).toBe(true)
    expect(errorOf({ ...two, series: [two.series[0]] })).toContain(message)
  })

  it('takes a heatmap of up to 24 rows by 12 columns', () => {
    const columns = (count: number) => Array.from({ length: count }, (_, index) => ({ label: `C${index}`, values: [1, 2] }))
    const heatmap = { title: 'Grid', chart_type: 'heatmap', labels: ['Mon', 'Tue'], series: columns(12) }
    expect(specOf(heatmap).series).toHaveLength(12)
    expect(errorOf({ ...heatmap, series: columns(13) })).toContain('1 to 12 series')
    expect(errorOf({ ...heatmap, labels: labels(25), series: [{ label: 'C', values: ones(25) }] })).toContain('at most 24')
  })

  it('adds up a waterfall to a computed Net bar', () => {
    const spec = specOf({ title: 'Month', chart_type: 'waterfall', labels: ['Salary', 'Rent', 'Food'], series: one([180000, -30000, -9000]) })
    expect(waterfallSteps(spec).at(-1)).toEqual({ label: 'Net', change: 141000, start: 0, end: 141000, net: true })
    expect(waterfallSteps(spec)[2]).toMatchObject({ start: 150000, end: 141000 })
    expect(errorOf({ title: 'W', chart_type: 'waterfall', labels: ['A'], series: [...one([1]), ...one([2])] })).toContain('exactly 1 series')
  })

  // A live run (2026-10-28) ended its steps with "Savings 97,800", which the Net bar then counted twice.
  it('rejects a waterfall whose last step is the running total', () => {
    const steps = { title: 'Sep', chart_type: 'waterfall', labels: ['Income', 'Rent', 'Savings'] }

    expect(errorOf({ ...steps, series: one([180000, -31300, 148700]) })).toContain('adds the Net bar itself')
    expect(specOf({ ...steps, series: one([180000, -31300, -5000]) }).chartType).toBe('waterfall')
  })

  it.each(CHART_TYPES)('round-trips a valid %s through chartArgs', (chartType) => {
    const samples: Record<string, Record<string, unknown>> = {
      combo: { series: [{ label: 'A', values: [1, 2], kind: 'bar' }, { label: 'Rate', values: [3, 4], kind: 'line', axis: 'right' }] },
      pie: { series: one([1, 2]) },
      donut: { series: one([1, 2]) },
      radar: { labels: ['A', 'B', 'C'], series: one([10, 20, 30]) },
      treemap: { series: one([1, 2]) },
      sankey: { links: [{ from: 'A', to: 'B', value: 5 }] },
      slope: { series: [{ label: '2025', values: [1, 2] }, { label: '2026', values: [3, 4] }] },
      scatter: { series: [{ label: 'X', values: [1, 2] }, { label: 'Y', values: [3, 4] }] },
      waterfall: { series: one([5, -2]) },
    }
    const input = { ...monthly, chart_type: chartType, source: 'estimate', source_note: 'RBI figures', ...samples[chartType] }
    const first = parseChartArgs(input)
    if (!first.ok) throw new Error(first.error)

    expect(parseChartArgs(chartArgs(first.spec))).toEqual(first)
  })
})

describe('render_chart schema and follow-ups', () => {
  it('advertises every chart type and source', () => {
    const properties = RENDER_CHART_TOOL.parameters.properties as Record<string, { enum?: string[] }>

    expect(properties.chart_type.enum).toEqual([...CHART_TYPES])
    expect(properties.source.enum).toEqual(['ledger', 'calculated', 'estimate'])
  })

  it('suggests other forms of the same data', () => {
    expect(followUps(specOf({ ...monthly, chart_type: 'stacked_bar' }))).toEqual([
      'Redraw "Income vs spending" as a line chart',
      'Redraw "Income vs spending" as a stacked area chart',
    ])
    expect(followUps(specOf({ title: 'Mix', chart_type: 'pie', labels: ['A', 'B'], series: one([1, 2]) }))).toEqual([
      'Redraw "Mix" as a ranking',
      'Redraw "Mix" as a treemap',
    ])
  })
})
