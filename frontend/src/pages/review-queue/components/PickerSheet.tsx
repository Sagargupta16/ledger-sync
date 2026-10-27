import { useEffect, useRef } from 'react'
import { motion } from 'motion/react'
import { X } from 'lucide-react'

import { Button } from '@/components/ui'
import { DURATION, EASING } from '@/constants/animations'
import { formatCurrency } from '@/lib/formatters'
import type { ReviewCategoryOption, ReviewItem } from '@/services/api/reviewQueue'

import type { CategoryLabel } from '../types'
import CategoryPickerList from './CategoryPickerList'
import PickerSuggestions from './PickerSuggestions'

interface PickerSheetProps {
  readonly item: ReviewItem
  readonly options: readonly ReviewCategoryOption[]
  readonly onPick: (label: CategoryLabel) => void
  readonly onClose: () => void
}

/**
 * Native modal `<dialog>`: the page behind is inert, Tab stays inside and
 * Escape arrives as `cancel`. A bottom sheet on phones, a centered panel from
 * `sm`; focus returns to the opener after the exit animation.
 */
export default function PickerSheet({ item, options, onPick, onClose }: PickerSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      opener?.focus()
    }
  }, [])

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="review-picker-title"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      className="fixed inset-0 z-50 m-0 size-full max-h-none max-w-none items-end justify-center border-0 bg-transparent p-0 text-foreground backdrop:bg-transparent open:flex sm:items-center sm:p-4"
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
        className="absolute inset-0 bg-[var(--modal-backdrop)]"
        onClick={onClose}
      />
      <motion.div
        initial={{ opacity: 0, y: 56 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 56 }}
        transition={{ duration: DURATION.default, ease: EASING.cinematic }}
        className="relative flex max-h-[85dvh] w-full flex-col overflow-hidden rounded-t-2xl border border-[var(--hairline-2)] bg-surface-dropdown pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] shadow-[var(--glass-shadow-strong)] sm:max-w-lg sm:rounded-xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-[var(--hairline-2)] px-4 pb-3 pt-4">
          <div className="min-w-0">
            <h2 id="review-picker-title" className="text-base font-semibold text-foreground">
              Change category
            </h2>
            <p className="mt-0.5 truncate text-xs text-text-tertiary">
              {formatCurrency(item.amount)} · {item.note ?? item.account}
            </p>
          </div>
          <Button variant="ghost" size="sm" aria-label="Close" icon={<X className="size-4" />} onClick={onClose} />
        </header>
        {item.suggestions.length > 0 && <PickerSuggestions suggestions={item.suggestions} onPick={onPick} />}
        <CategoryPickerList
          options={options}
          current={{ category: item.category, subcategory: item.subcategory }}
          onPick={onPick}
        />
      </motion.div>
    </dialog>
  )
}
