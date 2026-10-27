import { useCallback, useRef, useState } from 'react'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'

import { useDemoGuard } from '@/hooks/useDemoGuard'
import { getSessionSignal, isCurrentSession } from '@/lib/session'
import type { ReviewItem, ReviewRequest } from '@/services/api/reviewQueue'

import type { CategoryLabel, DeckMotion, ReviewStep } from './types'
import { useReviewWrite } from './useReviewQueueApi'

interface Deck {
  readonly current: ReviewItem | null
  readonly take: (item: ReviewItem) => void
  readonly giveBack: (item: ReviewItem) => void
  readonly countChange: (delta: 1 | -1) => void
}

const requestFor = (step: ReviewStep): ReviewRequest =>
  step.decision === 'change'
    ? { action: 'change', category: step.label?.category, subcategory: step.label?.subcategory }
    : { action: 'keep' }

/**
 * Keep, change and Undo. Each applies at once and saves in the background, in
 * order; a failed save puts its card back on top. Demo decisions stay on this page.
 */
export function useReviewDecisions({ current, take, giveBack, countChange }: Deck) {
  const { mutateAsync: sendWrite } = useReviewWrite()
  const { isDemoMode } = useDemoGuard()
  const [history, setHistory] = useState<ReviewStep[]>([])
  const [deckMotion, setDeckMotion] = useState<DeckMotion>({ exitTo: 1, enterFrom: 0 })
  const [pickerOpen, setPickerOpen] = useState(false)
  const demoNotice = useRef({ shown: false })

  const putBack = useCallback(
    (step: ReviewStep) => {
      setHistory((steps) => steps.filter((entry) => entry !== step))
      // The card that comes back on top must not inherit a picker opened for another.
      setPickerOpen(false)
      giveBack(step.item)
    },
    [giveBack],
  )

  const decide = useCallback(
    (step: ReviewStep) => {
      setDeckMotion({ exitTo: step.decision === 'keep' ? 1 : -1, enterFrom: 0 })
      take(step.item)
      setHistory((steps) => [...steps, step])
      setPickerOpen(false)
      if (isDemoMode) {
        if (!demoNotice.current.shown) toast.info('Demo reviews last for this visit only.')
        demoNotice.current.shown = true
        return
      }
      const isChange = step.decision === 'change'
      if (isChange) countChange(1)
      const signal = getSessionSignal()
      const write = { kind: 'review' as const, transactionId: step.item.transaction_id, body: requestFor(step) }
      sendWrite(write).catch((error: unknown) => {
        if (!isCurrentSession(signal)) return
        if (isChange) countChange(-1)
        if (isAxiosError(error) && error.response?.status === 404) {
          setHistory((steps) => steps.filter((entry) => entry !== step))
          toast.error('That transaction is no longer in your ledger.')
          return
        }
        // The card on top sinks back into the deck rather than flying off as if decided.
        setDeckMotion({ exitTo: 0, enterFrom: 0 })
        putBack(step)
        toast.error('That review was not saved, so the card is back on top.')
      })
    },
    [isDemoMode, take, countChange, sendWrite, putBack],
  )

  const keep = useCallback(() => {
    if (current) decide({ item: current, decision: 'keep' })
  }, [current, decide])

  const change = useCallback(
    (label: CategoryLabel) => {
      if (current) decide({ item: current, decision: 'change', label })
    },
    [current, decide],
  )

  const undo = useCallback(() => {
    const step = history.at(-1)
    if (!step) return
    putBack(step)
    setDeckMotion({ exitTo: 0, enterFrom: step.decision === 'keep' ? 1 : -1 })
    if (isDemoMode) return
    if (step.decision === 'change') countChange(1)
    const signal = getSessionSignal()
    sendWrite({ kind: 'undo', transactionId: step.item.transaction_id }).catch(() => {
      if (isCurrentSession(signal)) toast.error('Undo was not saved. Review the card again to replace it.')
    })
  }, [history, isDemoMode, putBack, countChange, sendWrite])

  const openPicker = useCallback(() => {
    if (current) setPickerOpen(true)
  }, [current])
  const closePicker = useCallback(() => setPickerOpen(false), [])

  const kept = history.filter((step) => step.decision === 'keep').length
  return {
    session: { kept, changed: history.length - kept },
    deckMotion,
    pickerOpen,
    canUndo: history.length > 0,
    isDemoMode,
    keep,
    change,
    undo,
    openPicker,
    closePicker,
  }
}
