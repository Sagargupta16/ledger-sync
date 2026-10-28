/**
 * The `render_chart` tool as the model sees it. Its limits come from
 * chartSpec.ts, whose validator enforces them (per chart type) when the tool runs.
 */

import type { ToolSpec } from '@/lib/chatAdapters'

import { CHART_LIMITS, CHART_SOURCES, CHART_TYPES, VALUE_FORMATS } from './chartSpec'

const TYPE_GUIDE = [
  'bar: compare a few periods or groups side by side',
  'stacked_bar: totals per period split into parts',
  'horizontal_bar: a ranking such as top categories',
  'line: a trend over time',
  'area: a trend with its volume filled',
  'stacked_area: parts of a total over time',
  'combo: bars with a line, optionally on a right axis (set series[].kind, and axis right for a rate)',
  'pie: parts of one whole, at most 7 slices',
  'donut: like pie with a centre total',
  'radar: a 0-100 profile across 3 to 12 dimensions',
  'treemap: parts of a whole with many items (up to 40)',
  'sankey: flows from one thing to another via links (no labels or series)',
  'slope: each item between two periods (two series: start, end)',
  'scatter: two measures per item (two series: x, y; labels name the points)',
  'heatmap: a grid of rows by columns (labels are rows, one series per column)',
  'waterfall: how steps add up to a net change (one series of signed changes; a Net bar is added)',
].join('; ')

export const RENDER_CHART_TOOL: ToolSpec = {
  name: 'render_chart',
  description:
    "Draw one chart on the user's AI Canvas. Values must come from the data tools, from a calculation " +
    'you state in source_note, or (only when asked) from general knowledge marked source "estimate". ' +
    'Returns {rendered: true} or {error} describing what to fix.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'chart_type'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.title },
      subtitle: {
        type: 'string',
        maxLength: CHART_LIMITS.subtitle,
        description: 'Period and scope in plain words, e.g. "Apr 2026 to Sep 2026, Food and Dining"',
      },
      chart_type: { type: 'string', enum: [...CHART_TYPES], description: TYPE_GUIDE },
      x_label: {
        type: 'string',
        maxLength: CHART_LIMITS.label,
        description: 'What the labels are, e.g. "Month" or "Category"',
      },
      labels: {
        type: 'array',
        minItems: 1,
        maxItems: CHART_LIMITS.rows,
        description: 'Short unique category, period or row labels in display order, e.g. ["2026-04", "2026-05"]',
        items: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.label },
      },
      series: {
        type: 'array',
        minItems: 1,
        maxItems: CHART_LIMITS.heatmapColumns,
        description: 'Values to draw, one number per label in the same order (up to 6 series, 12 for a heatmap)',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'values'],
          properties: {
            label: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.label },
            values: { type: 'array', items: { type: 'number' }, maxItems: CHART_LIMITS.rows },
            kind: { type: 'string', enum: ['bar', 'line'], description: 'combo only' },
            axis: { type: 'string', enum: ['left', 'right'], description: 'combo only; right for a rate or percentage' },
          },
        },
      },
      links: {
        type: 'array',
        minItems: 1,
        maxItems: CHART_LIMITS.links,
        description: 'sankey only: flows such as {"from": "Salary", "to": "Rent", "value": 30000}; must flow one way',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['from', 'to', 'value'],
          properties: {
            from: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.label },
            to: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.label },
            value: { type: 'number' },
          },
        },
      },
      value_format: {
        type: 'string',
        enum: [...VALUE_FORMATS],
        description: 'currency for INR amounts (default), percent for values already in percent, number for counts',
      },
      source: {
        type: 'string',
        enum: [...CHART_SOURCES],
        description:
          'ledger when every value came from the data tools; calculated when computed from them or from the ' +
          'calculate tool (projections, what-ifs); estimate only when the user asked for outside figures from ' +
          'general knowledge',
      },
      source_note: {
        type: 'string',
        maxLength: CHART_LIMITS.sourceNote,
        description: "What was used or assumed, e.g. '12% a year, monthly compounding'",
      },
    },
  },
}
