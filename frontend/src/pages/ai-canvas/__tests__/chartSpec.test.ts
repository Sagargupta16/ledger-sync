import { describe, expect, it } from 'vitest'

import { chartArgs, parseChartArgs } from '@/pages/ai-canvas/chartSpec'
import { RENDER_CHART_TOOL } from '@/pages/ai-canvas/renderChartTool'

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

function errorOf(input: Record<string, unknown>): string {
  const result = parseChartArgs(input)
  if (result.ok) throw new Error('expected the arguments to be rejected')
  return result.error
}

describe('parseChartArgs', () => {
  it('turns columns into the rows the chart kit reads', () => {
    const result = parseChartArgs(monthly)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.spec).toEqual({
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
    })
  })

  it('round-trips a spec through chartArgs', () => {
    const first = parseChartArgs(monthly)
    if (!first.ok) throw new Error(first.error)

    const second = parseChartArgs(chartArgs(first.spec))

    expect(second).toEqual(first)
  })

  it.each([
    [{ chart_type: 'scatter' }, 'chart_type must be one of'],
    [{ title: '' }, 'title must be a non-empty string'],
    [{ title: 'x'.repeat(81) }, 'title must be at most 80'],
    [{ labels: [] }, 'labels must list at least one label'],
    [{ labels: ['Apr', 'Apr'] }, 'labels has "Apr" twice'],
    [{ series: [] }, 'series must list 1 to 4'],
    [{ series: [{ label: 'Income', values: [1] }] }, 'must hold 2 numbers'],
    [{ series: [{ label: 'Income', values: [1, 'lots'] }] }, 'series[0].values[1] must be a number'],
    [{ series: [{ values: [1, 2] }] }, 'series[0].label must be a non-empty string'],
    [{ value_format: 'usd' }, 'value_format must be one of'],
  ])('rejects %o', (patch, message) => {
    expect(errorOf({ ...monthly, ...patch })).toContain(message)
  })

  it('caps labels at 60', () => {
    const labels = Array.from({ length: 61 }, (_, index) => `m${index}`)

    expect(errorOf({ ...monthly, labels })).toContain('at most 60')
  })

  it('holds a pie to one series, 7 slices and no negative values', () => {
    const pie = {
      title: 'Where it went',
      chart_type: 'pie',
      labels: ['Food', 'Rent'],
      series: [{ label: 'Spent', values: [12000, 30000] }],
    }
    const eight = Array.from({ length: 8 }, (_, index) => `c${index}`)

    expect(parseChartArgs(pie).ok).toBe(true)
    expect(errorOf({ ...pie, series: monthly.series })).toContain('exactly one series')
    expect(errorOf({ ...pie, labels: eight })).toContain('use horizontal_bar')
    expect(errorOf({ ...pie, series: [{ label: 'Spent', values: [-5, 1] }] })).toContain('negative')
    expect(errorOf({ ...pie, series: [{ label: 'Spent', values: [0, 0] }] })).toContain('above zero')
  })

  it('advertises every chart type in the tool schema', () => {
    const properties = RENDER_CHART_TOOL.parameters.properties as Record<string, { enum?: string[] }>

    expect(properties.chart_type.enum).toEqual(['bar', 'horizontal_bar', 'line', 'area', 'pie'])
  })
})
