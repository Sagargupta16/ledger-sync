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
      ? 'bg-app-red/90 hover:bg-app-red text-on-accent'
      : 'bg-app-orange/90 hover:bg-app-orange text-on-accent'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-backdrop)] p-4"
          onClick={handleClose}
        >
          <motion.div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            aria-describedby="confirm-dialog-desc"
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15, ease: 'easeOut' }}
            className="w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-6 shadow-[var(--glass-shadow-strong)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-foreground mb-2">{title}</h3>
            <p id="confirm-dialog-desc" className="text-sm text-muted-foreground mb-6">{description}</p>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={handleClose}
                className="px-4 py-2 bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-foreground rounded-lg hover:bg-[var(--overlay-5)] transition-colors duration-150 ease-out text-sm"
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
