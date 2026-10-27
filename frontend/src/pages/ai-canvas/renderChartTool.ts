/**
 * The `render_chart` tool as the model sees it. Its limits come from
 * chartSpec.ts, whose validator enforces them when the tool runs.
 */

import type { ToolSpec } from '@/lib/chatAdapters'

import { CHART_LIMITS, CHART_TYPES, VALUE_FORMATS } from './chartSpec'

export const RENDER_CHART_TOOL: ToolSpec = {
  name: 'render_chart',
  description:
    "Draw one chart on the user's AI Canvas. Call it only with values copied exactly from " +
    'the data tools\' results. Returns {rendered: true} or {error} describing what to fix.',
  parameters: {
    type: 'object',
    additionalProperties: false,
    required: ['title', 'chart_type', 'labels', 'series'],
    properties: {
      title: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.title },
      subtitle: {
        type: 'string',
        maxLength: CHART_LIMITS.subtitle,
        description: 'Period and scope, e.g. "Apr 2026 to Sep 2026, excluding transfers"',
      },
      chart_type: {
        type: 'string',
        enum: [...CHART_TYPES],
        description:
          'line or area for a series over time, bar to compare a few periods or groups, ' +
          'horizontal_bar for a ranking, pie only for parts of one whole (at most 7 slices)',
      },
      x_label: {
        type: 'string',
        maxLength: CHART_LIMITS.label,
        description: 'What the labels are, e.g. "Month" or "Category"',
      },
      labels: {
        type: 'array',
        minItems: 1,
        maxItems: CHART_LIMITS.rows,
        description: 'Short unique category or period labels in display order, e.g. ["2026-04", "2026-05"]',
        items: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.label },
      },
      series: {
        type: 'array',
        minItems: 1,
        maxItems: CHART_LIMITS.series,
        description: 'Values to draw, one number per label in the same order; a pie takes exactly one series',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'values'],
          properties: {
            label: { type: 'string', minLength: 1, maxLength: CHART_LIMITS.label },
            values: { type: 'array', items: { type: 'number' }, maxItems: CHART_LIMITS.rows },
          },
        },
      },
      value_format: {
        type: 'string',
        enum: [...VALUE_FORMATS],
        description: 'currency for INR amounts (default), percent for values already in percent, number for counts',
      },
    },
  },
}
