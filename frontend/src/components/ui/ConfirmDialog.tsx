/**
 * ConfirmDialog
 *
 * A modal confirmation dialog with premium design system styling,
 * animated entrance via motion, and danger/warning variants.
 * Closes on overlay click or Escape key.
 *
 * Built on a native `<dialog>` opened with `showModal()`, so the browser owns
 * the modal semantics: the rest of the page is inert, Tab stays inside, the
 * first control (Cancel, the safe action) takes initial focus, and Escape
 * arrives as a `cancel` event. The dialog element is a transparent full-screen
 * shell so the backdrop and panel keep their motion fade/scale in both
 * directions; focus returns to the opener once the exit animation finishes.
 */

import { useCallback, useEffect, useRef } from 'react'
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

/** The mounted dialog's props: `open` only decides whether it is mounted. */
type ConfirmDialogContentProps = Omit<ConfirmDialogProps, 'open'>

export default function ConfirmDialog({ open, ...contentProps }: ConfirmDialogProps) {
  return (
    <AnimatePresence>
      {open && <ConfirmDialogContent {...contentProps} />}
    </AnimatePresence>
  )
}

function ConfirmDialogContent({
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  onConfirm,
}: ConfirmDialogContentProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
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

  // Mounted only while open (AnimatePresence keeps it through the exit
  // animation), so open once on mount and restore the opener on unmount.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      previousFocus?.focus()
    }
  }, [])

  const warningClasses =
    variant === 'warning'
      ? 'border-app-orange bg-app-orange/90 text-on-orange hover:border-app-orange hover:bg-app-orange'
      : undefined

  return (
    <dialog
      ref={dialogRef}
      role="alertdialog"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
      onCancel={(e) => {
        e.preventDefault()
        handleClose()
      }}
      className="fixed inset-0 z-50 m-0 size-full max-h-none max-w-none items-center justify-center border-0 bg-transparent p-4 text-foreground backdrop:bg-transparent open:flex"
    >
      <motion.div
        aria-hidden="true"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
        className="absolute inset-0 bg-[var(--modal-backdrop)]"
        onClick={handleClose}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
        className="relative w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-6 shadow-[var(--glass-shadow-strong)]"
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
    </dialog>
  )
}
