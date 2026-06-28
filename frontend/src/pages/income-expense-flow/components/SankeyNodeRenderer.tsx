import { rawColors } from '@/constants/colors'
import { formatCurrency } from '@/lib/formatters'

import { getNodeFillColor, safeNumber } from '../sankeyUtils'

interface SankeyNodeRendererProps {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  readonly index: number
  readonly payload: { name: string }
  readonly nodeValues: Map<number, number>
  readonly incomeCategoryCount: number
  readonly totalIncomeNodeIndex: number
  readonly savingsNodeIndex: number
  readonly expensesNodeIndex: number
  readonly totalIncome: number
  readonly chartWidth: number
  readonly fontSize: number
}

export const SankeyNodeRenderer = ({
  x: rawX,
  y: rawY,
  width: rawWidth,
  height: rawHeight,
  index,
  payload,
  nodeValues,
  incomeCategoryCount,
  totalIncomeNodeIndex,
  savingsNodeIndex,
  expensesNodeIndex,
  totalIncome,
  chartWidth,
  fontSize,
}: SankeyNodeRendererProps) => {
  const x = safeNumber(rawX)
  const y = safeNumber(rawY)
  const width = safeNumber(rawWidth)
  const height = safeNumber(rawHeight)

  const value = nodeValues.get(index) || 0
  const percentage = totalIncome > 0 ? ((value / totalIncome) * 100).toFixed(1) : '0'
  const fillColor = getNodeFillColor(
    index,
    incomeCategoryCount,
    totalIncomeNodeIndex,
    savingsNodeIndex,
    expensesNodeIndex,
  )

  const onLeftSide = x < chartWidth / 2
  const labelX = onLeftSide ? x - 8 : x + width + 8
  const anchor: 'end' | 'start' = onLeftSide ? 'end' : 'start'

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={fillColor}
        fillOpacity={0.9}
        stroke={fillColor}
        strokeWidth={0}
        rx={4}
        ry={4}
      />
      <text
        x={labelX}
        y={y + height / 2 - fontSize * 0.25}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.chart.textPrimary}
        fontSize={fontSize}
        fontWeight="600"
      >
        {payload.name}
      </text>
      <text
        x={labelX}
        y={y + height / 2 + fontSize * 0.9}
        textAnchor={anchor}
        dominantBaseline="middle"
        fill={rawColors.app.purple}
        fontSize={fontSize - 2}
        fontWeight="500"
      >
        {formatCurrency(value)} ({percentage}%)
      </text>
    </g>
  )
}

interface SankeyNodeWrapperProps {
  readonly nodeValues: Map<number, number>
  readonly incomeCategoryCount: number
  readonly totalIncomeNodeIndex: number
  readonly savingsNodeIndex: number
  readonly expensesNodeIndex: number
  readonly totalIncome: number
  readonly chartWidth: number
  readonly fontSize: number
}

// eslint-disable-next-line react-refresh/only-export-components
export function createSankeyNodeComponent(context: SankeyNodeWrapperProps) {
  const SankeyNodeComponent = (nodeProps: {
    x: number
    y: number
    width: number
    height: number
    index: number
    payload: { name: string }
  }) => (
    <SankeyNodeRenderer
      {...nodeProps}
      nodeValues={context.nodeValues}
      incomeCategoryCount={context.incomeCategoryCount}
      totalIncomeNodeIndex={context.totalIncomeNodeIndex}
      savingsNodeIndex={context.savingsNodeIndex}
      expensesNodeIndex={context.expensesNodeIndex}
      totalIncome={context.totalIncome}
      chartWidth={context.chartWidth}
      fontSize={context.fontSize}
    />
  )
  return SankeyNodeComponent
}
