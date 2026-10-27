import { motion, useMotionValue, useTransform, type PanInfo, type Variants } from 'motion/react'
import { Check, Pencil, Sparkles } from 'lucide-react'

import { Money } from '@/components/ui'
import { DURATION, EASING } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { formatCurrency, formatDate } from '@/lib/formatters'
import type { ReviewItem } from '@/services/api/reviewQueue'

import { labelText } from '../reviewQueueUtils'
import type { DeckMotion } from '../types'

/** Past this drag distance (px) or fling speed (px/s), a release decides. */
const SWIPE_DISTANCE = 110
const SWIPE_VELOCITY = 650
const FLY_DISTANCE = 440
/** The suggester's first pick shows on the card only when it is this sure. */
const HINT_CONFIDENCE = 0.5

const cardVariants: Variants = {
  enter: ({ enterFrom }: DeckMotion) =>
    enterFrom === 0
      ? { opacity: 0.55, scale: 0.94, y: 18, x: 0 }
      : { opacity: 0, scale: 1, y: 0, x: enterFrom * FLY_DISTANCE },
  center: {
    opacity: 1,
    scale: 1,
    y: 0,
    x: 0,
    zIndex: 1,
    transition: { duration: DURATION.default, ease: EASING.cinematic },
  },
  exit: ({ exitTo }: DeckMotion) =>
    exitTo === 0
      ? { opacity: 0, scale: 0.94, y: 18, zIndex: 0, transition: { duration: DURATION.quick, ease: EASING.cinematic } }
      : { opacity: 0, x: exitTo * FLY_DISTANCE, zIndex: 2, transition: { duration: DURATION.quick, ease: EASING.smooth } },
}

interface ReviewCardProps {
  readonly item: ReviewItem
  /** How this card arrives; the deck's AnimatePresence supplies how it leaves. */
  readonly deckMotion: DeckMotion
  readonly onKeep: () => void
  readonly onChange: () => void
  readonly className?: string
}

/** The top card: drag right to keep, left to change. Buttons and keys do the same. */
export default function ReviewCard({ item, deckMotion, onKeep, onChange, className }: ReviewCardProps) {
  const x = useMotionValue(0)
  const rotate = useTransform(x, [-200, 0, 200], [-12, 0, 12])
  const keepStamp = useTransform(x, [24, SWIPE_DISTANCE], [0, 1])
  const changeStamp = useTransform(x, [-SWIPE_DISTANCE, -24], [1, 0])
  const hint = item.suggestions[0]
  const showHint = hint !== undefined && (hint.confidence ?? 0) >= HINT_CONFIDENCE
  const isIncome = item.type === 'Income'

  const onDragEnd = (_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) => {
    const far = Math.abs(info.offset.x) > SWIPE_DISTANCE
    const fast = Math.abs(info.velocity.x) > SWIPE_VELOCITY
    if (!far && !fast) return
    if ((far ? info.offset.x : info.velocity.x) > 0) onKeep()
    else onChange()
  }

  return (
    <motion.article
      variants={cardVariants}
      custom={deckMotion}
      initial="enter"
      animate="center"
      exit="exit"
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.85}
      onDragEnd={onDragEnd}
      whileDrag={{ scale: 1.02 }}
      style={{ x, rotate }}
      aria-label={`${item.type} of ${formatCurrency(item.amount)} on ${formatDate(item.date)}, filed under ${labelText(item)}`}
      className={cn(
        'relative flex min-h-[19rem] cursor-grab touch-pan-y select-none flex-col gap-4 rounded-xl border border-[var(--hairline-3)] bg-surface-1 p-5 shadow-[var(--glass-shadow-strong)] active:cursor-grabbing',
        className,
      )}
    >
      <motion.span
        aria-hidden="true"
        style={{ opacity: keepStamp }}
        className="pointer-events-none absolute left-4 top-4 inline-flex -rotate-6 items-center gap-1 rounded-md border-2 border-app-green px-2 py-0.5 text-sm font-bold uppercase tracking-wide text-app-green"
      >
        <Check className="size-4" /> Keep
      </motion.span>
      <motion.span
        aria-hidden="true"
        style={{ opacity: changeStamp }}
        className="pointer-events-none absolute right-4 top-4 inline-flex rotate-6 items-center gap-1 rounded-md border-2 border-app-blue px-2 py-0.5 text-sm font-bold uppercase tracking-wide text-app-blue"
      >
        <Pencil className="size-4" /> Change
      </motion.span>

      <header className="flex items-start justify-between gap-3 pt-6">
        <div className="min-w-0">
          <p className="ledger-meta text-text-tertiary">{formatDate(item.date)}</p>
          <p className="mt-1 truncate text-sm text-muted-foreground">{item.account}</p>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full border px-2 py-0.5 text-xs font-medium',
            isIncome ? 'border-app-green/40 text-app-green' : 'border-app-red/40 text-app-red',
          )}
        >
          {item.type}
        </span>
      </header>

      <Money
        value={item.amount}
        bold
        className={cn('text-left text-2xl sm:text-3xl', isIncome ? 'text-app-green' : 'text-foreground')}
      />

      <p className="line-clamp-3 min-h-[1.25rem] text-sm leading-5 text-text-secondary [overflow-wrap:anywhere]">
        {item.note ?? 'No note'}
      </p>

      <div className="mt-auto space-y-2">
        <p className="ledger-meta text-text-tertiary">Category</p>
        <div className="rounded-lg border border-[var(--hairline-2)] bg-[var(--overlay-2)] px-3 py-2">
          <p className="text-base font-semibold text-foreground [overflow-wrap:anywhere]">{item.category}</p>
          {item.subcategory && (
            <p className="text-xs text-text-tertiary [overflow-wrap:anywhere]">{item.subcategory}</p>
          )}
        </div>
        {showHint && (
          <p className="flex items-center gap-1.5 text-xs text-app-blue">
            <Sparkles className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0 truncate">
              Looks like {labelText(hint)} ({Math.round((hint.confidence ?? 0) * 100)}% sure)
            </span>
          </p>
        )}
      </div>
    </motion.article>
  )
}
