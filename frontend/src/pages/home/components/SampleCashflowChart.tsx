import { useState } from 'react'
import { motion, type Variants } from 'motion/react'

import { EASING } from '@/constants/animations'
import { colors } from '@/constants/colors'

import { SAMPLE_AVG_SPENDING, SAMPLE_FY, SAMPLE_MONTHS, formatInr } from '../sampleData'
import { useElementWidth } from './useElementWidth'

const Y_MAX = 250_000
const GRID_LINES = [100_000, 200_000]
const TOP_PAD = 8

const bar: Variants = {
  hidden: { scaleY: 0 },
  visible: (order: number) => ({
    scaleY: 1,
    transition: { delay: 0.15 + order * 0.06, duration: 0.6, ease: EASING.cinematic },
  }),
}

const averageLine: Variants = {
  hidden: { scaleX: 0, opacity: 0 },
  visible: {
    scaleX: 1,
    opacity: 1,
    transition: { delay: 0.75, duration: 0.7, ease: EASING.cinematic },
  },
}

/** Bar with 4px rounded top corners, anchored flat on the baseline. */
function barPath(x: number, top: number, width: number, base: number): string {
  const r = Math.min(4, width / 2, base - top)
  return `M${x} ${base}V${top + r}Q${x} ${top} ${x + r} ${top}H${x + width - r}Q${x + width} ${top} ${x + width} ${top + r}V${base}Z`
}

const SUMMARY = `Sample income and spending by month, April to September. Average spending ${formatInr(
  SAMPLE_AVG_SPENDING,
)}.`

interface SampleCashflowChartProps {
  show: boolean
  reduce: boolean
}

export function SampleCashflowChart({ show, reduce }: Readonly<SampleCashflowChartProps>) {
  const [frameRef, measured] = useElementWidth<HTMLDivElement>(480)
  const [active, setActive] = useState<number | null>(null)

  const width = Math.max(measured, 240)
  const height = width < 420 ? 140 : 168
  const column = width / SAMPLE_MONTHS.length
  const barWidth = Math.min(18, Math.max(8, column * 0.26))
  const y = (value: number) => height - (value / Y_MAX) * (height - TOP_PAD)
  const readout = SAMPLE_MONTHS[active ?? SAMPLE_MONTHS.length - 1]
  const state = show ? 'visible' : 'hidden'
  const initial = reduce ? false : 'hidden'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <p className="ledger-meta text-muted-foreground">Income vs spending, {SAMPLE_FY}</p>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-income" aria-hidden="true" />
            Income
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-expense" aria-hidden="true" />
            Spending
          </li>
          <li className="inline-flex items-center gap-1.5">
            <span className="w-3 border-t border-dashed border-expense" aria-hidden="true" />
            Avg spend {formatInr(SAMPLE_AVG_SPENDING)}
          </li>
        </ul>
      </div>

      <dl className="mt-4 grid grid-cols-3 gap-3" aria-live="polite">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">{readout.month} income</dt>
          <dd className="ledger-figure mt-0.5 text-sm font-semibold text-foreground">
            {formatInr(readout.income)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Spending</dt>
          <dd className="ledger-figure mt-0.5 text-sm font-semibold text-foreground">
            {formatInr(readout.spending)}
          </dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Left over</dt>
          <dd className="ledger-figure mt-0.5 text-sm font-semibold text-income">
            {formatInr(readout.income - readout.spending)}
          </dd>
        </div>
      </dl>

      <div ref={frameRef} className="relative mt-3 pb-10">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="block h-auto w-full"
          role="img"
          aria-label={SUMMARY}
        >
          {GRID_LINES.map((value) => (
            <line key={value} x1={0} x2={width} y1={y(value)} y2={y(value)} className="stroke-border" />
          ))}
          <line x1={0} x2={width} y1={height - 0.5} y2={height - 0.5} className="stroke-border" />
          {SAMPLE_MONTHS.map((month, i) => {
            const center = column * i + column / 2
            const dimmed = active !== null && active !== i
            return (
              <g
                key={month.month}
                className={`transition-opacity duration-200 ${dimmed ? 'opacity-35' : ''}`}
              >
                <motion.path
                  d={barPath(center - barWidth - 1, y(month.income), barWidth, height)}
                  fill={colors.financial.income}
                  fillOpacity={0.85}
                  custom={i}
                  variants={bar}
                  initial={initial}
                  animate={state}
                  style={{ originY: 1 }}
                />
                <motion.path
                  d={barPath(center + 1, y(month.spending), barWidth, height)}
                  fill={colors.financial.expense}
                  fillOpacity={0.85}
                  custom={i + 0.5}
                  variants={bar}
                  initial={initial}
                  animate={state}
                  style={{ originY: 1 }}
                />
              </g>
            )
          })}
          <motion.line
            x1={0}
            x2={width}
            y1={y(SAMPLE_AVG_SPENDING)}
            y2={y(SAMPLE_AVG_SPENDING)}
            stroke={colors.financial.expense}
            strokeWidth={1.5}
            strokeDasharray="4 4"
            variants={averageLine}
            initial={initial}
            animate={state}
            style={{ originX: 0 }}
          />
        </svg>

        <div className="absolute inset-0 grid grid-cols-6">
          {SAMPLE_MONTHS.map((month, i) => (
            <button
              key={month.month}
              type="button"
              aria-pressed={active === i}
              aria-label={`${month.month}: income ${formatInr(month.income)}, spending ${formatInr(month.spending)}`}
              onClick={() => setActive(i)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              className="flex items-end justify-center rounded-md pb-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground aria-pressed:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)]"
            >
              {month.month}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
