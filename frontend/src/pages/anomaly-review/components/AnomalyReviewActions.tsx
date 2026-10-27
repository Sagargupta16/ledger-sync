import { AnimatePresence, motion } from 'motion/react'
import { ArrowUpRight, Check, ChevronDown, ChevronUp, X } from 'lucide-react'
import { Link } from 'react-router'

import { Button, Input } from '@/components/ui'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'

import { reviewCopy, reviewLink } from '../typeCopy'

interface Props {
  anomaly: Anomaly
  isExpanded: boolean
  noteText: string
  isReviewPending: boolean
  onToggleNote: (anomalyId: number) => void
  onNoteTextChange: (value: string) => void
  onReview: (anomalyId: number, dismiss: boolean) => void
}

/**
 * The two review outcomes in the type's own words, the page that owns the fix,
 * and an optional note. Demo mode keeps the buttons live; the review handler
 * explains that changes are disabled there.
 */
export default function AnomalyReviewActions({
  anomaly,
  isExpanded,
  noteText,
  isReviewPending,
  onToggleNote,
  onNoteTextChange,
  onReview,
}: Readonly<Props>) {
  const copy = reviewCopy(anomaly.anomaly_type)
  const link = reviewLink(anomaly)

  return (
    <div className="relative mt-4 ml-0 space-y-2 sm:ml-11">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<Check className="w-3 h-3" />}
          onClick={() => onReview(anomaly.id, false)}
          disabled={isReviewPending}
          className="border-app-green/20 bg-app-green/10 text-app-green hover:bg-app-green/20"
        >
          {copy.review}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          icon={<X className="w-3 h-3" />}
          onClick={() => onReview(anomaly.id, true)}
          disabled={isReviewPending}
          className="border-app-red/20 bg-app-red/10 text-app-red hover:bg-app-red/20"
        >
          {copy.dismiss}
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={
            isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
          }
          onClick={() => onToggleNote(anomaly.id)}
          aria-expanded={isExpanded}
        >
          Add Note
        </Button>
        {link && (
          <Link
            to={link.to}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2.5 text-xs font-medium text-primary transition-colors hover:bg-[var(--overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8"
          >
            {link.label}
            <ArrowUpRight className="h-3 w-3" aria-hidden />
          </Link>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {isExpanded && (
          <motion.div
            {...DISCLOSURE_TRANSITION}
            // Only a change to the anomaly can resize the card content above this note.
            layoutDependency={anomaly}
          >
            <Input
              type="text"
              value={noteText}
              onChange={(event) => onNoteTextChange(event.target.value)}
              placeholder="Add review notes..."
              aria-label="Add review notes"
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
