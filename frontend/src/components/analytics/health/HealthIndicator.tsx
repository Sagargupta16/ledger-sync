import { motion } from 'motion/react'

import ProgressBar from '@/components/shared/ProgressBar'
import { EASING } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

interface HealthIndicatorProps {
  readonly name: string
  readonly score: number
  readonly value?: string
  readonly description: string
  readonly target: string
  readonly color: string
}

export default function HealthIndicator({
  name, score, value, description, target, color,
}: HealthIndicatorProps) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const roundedScore = Math.round(score)

  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.28, ease: EASING.cinematic }}
      className="flex min-w-0 flex-col gap-2 border-t border-[var(--hairline-1)] py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <h4 className="min-w-0 text-xs font-medium leading-5 text-foreground">{name}</h4>
        <p className="shrink-0 font-mono text-sm font-semibold leading-5 tabular-nums" style={{ color }}>
          {value ?? roundedScore}
          {!value && <span className="ml-0.5 text-[10px] font-normal text-text-tertiary">/100</span>}
        </p>
      </div>
      <p className="text-pretty text-xs leading-5 text-text-secondary tabular-nums">{description}</p>
      <div className="mt-auto">
        <ProgressBar
          value={score}
          color={color}
          height={4}
          ariaLabel={`${name} score: ${roundedScore} out of 100`}
        />
        <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 text-[11px] leading-4 tabular-nums">
          <p className="text-text-tertiary">
            Target <span className="font-medium text-text-secondary">{target}</span>
          </p>
          {value && <p className="font-mono text-text-tertiary">Score {roundedScore}/100</p>}
        </div>
      </div>
    </motion.div>
  )
}
