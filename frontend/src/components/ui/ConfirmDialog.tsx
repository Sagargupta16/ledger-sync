/**
 * ConfirmDialog
 *
 * A modal confirmation dialog with premium design system styling,
 * animated entrance via framer-motion, and danger/warning variants.
 * Closes on overlay click or Escape key.
 */

import { useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ConfirmDialogProps {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly title: string
  readonly description: string
  readonly confirmLabel?: string
  readonly cancelLabel?: string
  readonly variant?: 'danger' | 'warning'
  readonly onConfirm: () => void | Promise<void>
}

export default function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
}: ConfirmDialogProps) {
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  const confirmColors =
    variant === 'danger'
      ? 'bg-red-500/90 hover:bg-red-500 text-white'
      : 'bg-orange-500/90 hover:bg-orange-500 text-white'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="bg-[#1a1a1c] rounded-2xl border border-white/[0.08] p-6 max-w-md w-full shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
            <p className="text-sm text-muted-foreground mb-6">{description}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-white/[0.06] border border-white/[0.08] text-white rounded-lg hover:bg-white/[0.10] transition-colors duration-150 ease-out text-sm"
              >
                {cancelLabel}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await onConfirm()
                  handleClose()
                }}
                className={`px-4 py-2 rounded-lg transition-colors duration-150 ease-out text-sm font-medium ${confirmColors}`}
              >
                {confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
