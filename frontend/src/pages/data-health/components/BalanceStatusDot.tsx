import { motion } from 'motion/react'

import { SPRING } from '@/constants/animations'
import { cn } from '@/lib/cn'
import type { BalanceStatus } from '@/services/api/balanceChecks'

import { STATUS_META } from '../balanceCheckUtils'

interface BalanceStatusDotProps {
  readonly status: BalanceStatus
  readonly className?: string
}

/**
 * The freshness dot. Keyed by status, so a save that changes the verdict pops
 * the new colour in rather than swapping it silently.
 */
export default function BalanceStatusDot({ status, className }: BalanceStatusDotProps) {
  return (
    <motion.span
      key={status}
      aria-hidden
      initial={{ scale: 0.4, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={SPRING.control}
      className={cn('inline-block size-2.5 shrink-0 rounded-full', STATUS_META[status].dot, className)}
    />
  )
}
