import { motion } from 'motion/react'

import { fadeUpItem, staggerContainer } from '@/constants/animations'

import { SAMPLE_KPIS } from '../sampleData'
import { CountUp } from './CountUp'

interface SampleKpisProps {
  show: boolean
  reduce: boolean
}

export function SampleKpis({ show, reduce }: Readonly<SampleKpisProps>) {
  return (
    <motion.dl
      className="grid grid-cols-2 border-b border-border sm:grid-cols-4"
      variants={staggerContainer}
      initial={reduce ? false : 'hidden'}
      animate={show ? 'visible' : 'hidden'}
    >
      {SAMPLE_KPIS.map((kpi) => (
        <motion.div
          key={kpi.label}
          variants={fadeUpItem}
          className="min-w-0 border-border p-4 odd:border-r sm:border-r sm:p-5 sm:last:border-r-0 [&:nth-child(-n+2)]:border-b sm:[&:nth-child(-n+2)]:border-b-0"
        >
          <dt className="text-xs text-muted-foreground">{kpi.label}</dt>
          <dd className="ledger-figure mt-1.5 text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            <span className="sr-only">{kpi.format(kpi.value)}</span>
            <span aria-hidden="true" data-countup="">
              <CountUp value={show ? kpi.value : 0} format={kpi.format} duration={1100} />
            </span>
          </dd>
          <dd className={`mt-1 text-xs ${kpi.noteClass}`}>{kpi.note}</dd>
        </motion.div>
      ))}
    </motion.dl>
  )
}
