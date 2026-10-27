import { AnimatePresence, motion } from 'motion/react'

import { Money } from '@/components/ui'
import { DURATION, EASING } from '@/constants/animations'
import { formatCurrency } from '@/lib/formatters'
import type { ReviewItem } from '@/services/api/reviewQueue'

import { labelText } from '../reviewQueueUtils'
import type { DeckMotion } from '../types'
import ReviewCard from './ReviewCard'

interface ReviewDeckProps {
  readonly current: ReviewItem
  readonly next: ReviewItem | null
  readonly deckMotion: DeckMotion
  readonly onKeep: () => void
  readonly onChange: () => void
}

/**
 * The top card with the next one waiting behind it. Every card sits in the
 * same grid cell, so a leaving card and its successor overlap without
 * absolute positioning and the deck keeps its height. The first card rises
 * out of the deck too, so the queue never just appears.
 */
export default function ReviewDeck({ current, next, deckMotion, onKeep, onChange }: ReviewDeckProps) {
  return (
    <div className="mx-auto grid w-full max-w-md">
      <AnimatePresence>
        {next && (
          <motion.div
            key={`peek-${next.transaction_id}`}
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.55, transition: { duration: DURATION.default, ease: EASING.cinematic } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
            className="pointer-events-none flex min-h-[19rem] translate-y-[18px] scale-[0.94] flex-col justify-end rounded-xl border border-[var(--hairline-2)] bg-surface-1 p-5 [grid-area:1/1]"
          >
            <Money value={next.amount} muted className="text-left text-xl" />
            <p className="mt-1 truncate text-sm text-text-tertiary">{next.category}</p>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence custom={deckMotion}>
        <ReviewCard
          key={current.transaction_id}
          item={current}
          deckMotion={deckMotion}
          onKeep={onKeep}
          onChange={onChange}
          className="[grid-area:1/1]"
        />
      </AnimatePresence>
      <output className="sr-only">
        {`Now reviewing: ${current.type} of ${formatCurrency(current.amount)}, filed under ${labelText(current)}`}
      </output>
    </div>
  )
}
