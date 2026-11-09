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
 *
 * Confirming is a small state machine: idle -> pending -> closed, or
 * pending -> failed -> pending again. While pending the confirm button spins
 * and Cancel, Escape and the backdrop are inert, so the dialog cannot vanish
 * while its action still runs. A rejecting `onConfirm` keeps the dialog open
 * with the reason, so the user can retry or cancel with the context in view;
 * pass the action's promise (`mutateAsync`) and let it reject.
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import { DURATION, EASING } from '@/constants/animations'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { markErrorReported } from '@/lib/queryClient'

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

type ConfirmPhase =
  | { readonly kind: 'idle' }
  | { readonly kind: 'pending' }
  | { readonly kind: 'failed'; readonly message: string }

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
  const titleId = useId()
  const descriptionId = useId()
  const [phase, setPhase] = useState<ConfirmPhase>({ kind: 'idle' })
  const handleClose = useCallback(() => onOpenChange(false), [onOpenChange])

  // Set synchronously, so a second click in the same tick (or one during the
  // exit animation) is ignored before the pending render lands. A rejection
  // re-arms it so the user can retry.
  const confirmingRef = useRef(false)
  const dismiss = useCallback(() => {
    if (!confirmingRef.current) handleClose()
  }, [handleClose])
  const handleConfirm = useCallback(async () => {
    if (confirmingRef.current) return
    confirmingRef.current = true
    setPhase({ kind: 'pending' })
    try {
      await onConfirm()
    } catch (error) {
      // Shown here, so the global mutation toast stays quiet.
      markErrorReported(error)
      confirmingRef.current = false
      setPhase({ kind: 'failed', message: getApiErrorMessage(error, 'That did not go through. Try again.') })
      return
    }
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
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={phase.kind === 'pending' || undefined}
      onCancel={(e) => {
        e.preventDefault()
        dismiss()
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
        onClick={dismiss}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
        className="relative w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-6 shadow-[var(--glass-shadow-strong)]"
      >
        <h3 id={titleId} className="text-lg font-semibold text-foreground mb-2">{title}</h3>
        <p id={descriptionId} className="text-sm text-muted-foreground mb-6">{description}</p>
        {phase.kind === 'failed' && (
          <p role="alert" className="-mt-3 mb-6 text-sm text-error">
            {phase.message}
          </p>
        )}
        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            size="lg"
            onClick={dismiss}
            disabled={phase.kind === 'pending'}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            size="lg"
            onClick={() => void handleConfirm()}
            isLoading={phase.kind === 'pending'}
            className={warningClasses}
          >
            {confirmLabel}
          </Button>
        </div>
      </motion.div>
    </dialog>
  )
}
