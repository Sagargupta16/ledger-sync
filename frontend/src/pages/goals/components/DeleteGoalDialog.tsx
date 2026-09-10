import { useEffect, useId, useRef } from 'react'

import { Button } from '@/components/ui'

export default function DeleteGoalDialog({
  open,
  goalName,
  isPending,
  isDemoMode,
  error,
  onClose,
  onConfirm,
}: Readonly<{
  open: boolean
  goalName: string
  isPending: boolean
  isDemoMode: boolean
  error?: string | null
  onClose: () => void
  onConfirm: () => Promise<boolean>
}>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const descriptionId = useId()

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  const handleConfirm = async () => {
    if (isPending) return
    if (await onConfirm()) onClose()
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      aria-busy={isPending}
      onCancel={(event) => {
        event.preventDefault()
        if (!isPending) onClose()
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%_-_2rem)] max-w-md overflow-y-auto rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-5 text-foreground shadow-[var(--glass-shadow-strong)] backdrop:bg-[var(--modal-backdrop)] sm:p-6"
    >
      <h3 id={titleId} className="text-lg font-semibold">Delete this goal?</h3>
      <p id={descriptionId} className="mt-2 break-words text-sm text-text-secondary">
        {isDemoMode
          ? `"${goalName}" will be removed from this demo visit. Reload the page to restore it.`
          : `"${goalName}" and its saved allocation will be permanently removed. Your transactions will stay unchanged.`}
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-app-red">{error}</p>}
      <div className="mt-5 flex flex-wrap justify-end gap-3">
        <Button variant="secondary" size="lg" disabled={isPending} onClick={onClose} autoFocus>
          Keep goal
        </Button>
        <Button variant="danger" size="lg" isLoading={isPending} onClick={() => void handleConfirm()}>
          {isPending ? 'Deleting...' : 'Delete goal'}
        </Button>
      </div>
    </dialog>
  )
}
