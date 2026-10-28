import { motion } from 'motion/react'

import ChartFrame from '@/components/charts/ChartFrame'
import { useChartFrame } from '@/components/charts/chartContext'
import { chartTransition, staggerDelay } from '@/components/charts/chartMotion'
import { categoryScale, linearScale } from '@/components/charts/scales'
import { chartDataTable } from '@/components/ui/chartDataTable'

import type { ChartSpec } from '../chartSpec'
import { signed, waterfallSteps, type WaterfallStep } from '../waterfall'
import { CANVAS_CHART_HEIGHT, tickFont, type CanvasChartProps } from './canvasColors'
import { XLabels, YTicks } from './svgAxes'

type Props = CanvasChartProps & { readonly spec: ChartSpec }

/** Bars print their change only while wide enough for it. */
const LABEL_MIN_BAND = 30

function WaterfallBars({ spec, semantic, palette, ticks }: Props) {
  const { width, height, isMobile, animate, entered } = useChartFrame()
  const steps = waterfallSteps(spec)
  const margin = { top: 18, right: 12, bottom: 30, left: isMobile ? 48 : 60 }
  const levels = steps.flatMap((step) => [step.start, step.end])
  const y = linearScale([Math.min(0, ...levels), Math.max(0, ...levels)], [height - margin.bottom, margin.top], {
    tickCount: isMobile ? 4 : 5,
  })
  const x = categoryScale(steps.map((step) => step.label), [margin.left, width - margin.right], { kind: 'band' })
  const font = tickFont(isMobile)
  const colorOf = (step: WaterfallStep) => {
    if (step.net) return palette[0]
    return step.change >= 0 ? semantic.income : semantic.expense
  }
  return (
    <>
      <YTicks scale={y} x0={margin.left} x1={width - margin.right} format={(value) => ticks(value)} isMobile={isMobile} />
      <line x1={margin.left} x2={width - margin.right} y1={y(0)} y2={y(0)} className="stroke-(--chart-axis-line)" />
      {steps.map((step, index) => {
        const top = y(Math.max(step.start, step.end))
        const barHeight = Math.max(1, Math.abs(y(step.start) - y(step.end)))
        const next = steps[index + 1]
        return (
          <g key={step.label}>
            {next && !next.net && (
              <line
                x1={x.start(index) + x.bandwidth}
                x2={x.start(index + 1)}
                y1={y(step.end)}
                y2={y(step.end)}
                strokeDasharray="3 3"
                className="stroke-(--chart-reference-line)"
              />
            )}
            <motion.rect
              x={x.start(index)}
              width={x.bandwidth}
              rx={3}
              fill={colorOf(step)}
              initial={animate ? { y: y(step.start), height: 0 } : false}
              animate={entered ? { y: top, height: barHeight } : { y: y(step.start), height: 0 }}
              transition={chartTransition('bar', animate, staggerDelay(index, steps.length))}
            >
              <title>{`${step.label}: ${signed(step, ticks(step.change))}`}</title>
            </motion.rect>
            {x.bandwidth >= LABEL_MIN_BAND && (
              <text
                x={x.center(index)}
                y={step.change >= 0 ? top - 5 : top + barHeight + 12}
                textAnchor="middle"
                fontSize={font}
                className="fill-(--chart-text-secondary) font-mono"
              >
                {signed(step, ticks(step.change))}
              </text>
            )}
          </g>
        )
      })}
      <XLabels
        labels={steps.map((step) => step.label)}
        centers={steps.map((_, index) => x.center(index))}
        y={height - 10}
        width={width - margin.left - margin.right}
        isMobile={isMobile}
      />
    </>
  )
}

/** How signed changes add up step by step to a net result, which closes the chart. */
export default function WaterfallChart(props: Props) {
  const { spec, format, ariaLabel } = props
  const steps = waterfallSteps(spec)
  return (
    <>
      <ChartFrame height={CANVAS_CHART_HEIGHT} ariaLabel={ariaLabel} dataLength={steps.length}>
        <WaterfallBars {...props} />
      </ChartFrame>
      {chartDataTable(
        steps,
        [
          { header: spec.xLabel, rowHeader: true, value: (step) => step.label },
          { header: spec.series[0].label, value: (step) => format(step.change) },
          { header: 'Running total', value: (step) => format(step.end) },
        ],
        ariaLabel,
        (step) => step.label,
      )}
    </>
  )
}
