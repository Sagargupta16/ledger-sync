/**
 * ConfirmDialog
 *
 * A modal confirmation dialog with premium design system styling,
 * animated entrance via motion, and danger/warning variants.
 * Closes on overlay click or Escape key.
 */

import { useCallback, useEffect } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { DURATION, EASING } from '@/constants/animations'

import Button from './Button'

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

  // onConfirm may be async and the dialog must stay open until it settles, so
  // the await-then-close sequence is unchanged. `void` at the call site only
  // adapts it to the void-returning onClick prop -- no catch is attached, so a
  // rejecting onConfirm behaves exactly as before. Every current caller already
  // handles its own errors (Settings reset toasts; goals and subscriptions pass
  // synchronous handlers).
  const handleConfirm = useCallback(async () => {
    await onConfirm()
    handleClose()
  }, [onConfirm, handleClose])

  // Close on Escape key
  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, handleClose])

  const warningClasses =
    variant === 'warning'
      ? 'border-app-orange bg-app-orange/90 text-on-orange hover:border-app-orange hover:bg-app-orange'
      : undefined

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
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
            transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
            className="w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-6 shadow-[var(--glass-shadow-strong)]"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="confirm-dialog-title" className="text-lg font-semibold text-foreground mb-2">{title}</h3>
            <p id="confirm-dialog-desc" className="text-sm text-muted-foreground mb-6">{description}</p>
            <div className="flex justify-end gap-3">
              <Button
                variant="secondary"
                size="lg"
                onClick={handleClose}
              >
                {cancelLabel}
              </Button>
              <Button
                variant={variant === 'danger' ? 'danger' : 'primary'}
                size="lg"
                onClick={() => void handleConfirm()}
                className={warningClasses}
              >
                {confirmLabel}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
