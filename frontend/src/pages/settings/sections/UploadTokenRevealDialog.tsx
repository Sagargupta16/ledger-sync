/**
 * One-time display of a new upload token.
 *
 * The server returns the plaintext only in the create response, so this is
 * the only time it appears. The section holds it in state and clears it when
 * this closes. A tap on the backdrop does not close it, so a stray touch
 * cannot discard a token before it is copied; Done and Escape do.
 *
 * Same native `<dialog>` shell and motion as ConfirmDialog.
 */

import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Copy } from 'lucide-react'

import Button from '@/components/ui/Button'
import { DURATION, EASING } from '@/constants/animations'

export interface RevealedUploadToken {
  name: string
  token: string
}

interface Props {
  revealed: RevealedUploadToken | null
  uploadUrl: string
  /** Focus target on close: what submitted the create, captured at submit time. */
  returnFocusRef: RefObject<HTMLElement | null>
  onClose: () => void
}

type ContentProps = Omit<Props, 'revealed'> & { revealed: RevealedUploadToken }

export default function UploadTokenRevealDialog({ revealed, ...props }: Readonly<Props>) {
  return (
    <AnimatePresence>
      {revealed && <RevealContent revealed={revealed} {...props} />}
    </AnimatePresence>
  )
}

function RevealContent({ revealed, uploadUrl, returnFocusRef, onClose }: Readonly<ContentProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const id = useId()

  // Mounted only while open, so open on mount and hand focus back on unmount.
  useEffect(() => {
    const dialog = dialogRef.current
    // The opener stays mounted while the dialog is open, so capture it now.
    const opener = returnFocusRef.current
    if (!dialog) return
    if (!dialog.open) dialog.showModal()
    return () => {
      if (dialog.open) dialog.close()
      opener?.focus()
    }
  }, [returnFocusRef])

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(revealed.token)
      setCopyState('copied')
    } catch {
      // Clipboard access needs a secure context and can be refused. Select
      // the token so it can be copied by hand instead.
      fieldRef.current?.select()
      setCopyState('failed')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-desc`}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
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
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
        className="relative max-h-full w-full max-w-md overflow-y-auto rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-5 shadow-[var(--glass-shadow-strong)] sm:p-6"
      >
        <h3 id={`${id}-title`} className="text-lg font-semibold text-foreground">
          Copy your upload token
        </h3>
        <p id={`${id}-desc`} className="mt-2 break-words text-sm leading-6 text-muted-foreground">
          This is the token for "{revealed.name}". It won't be shown again, so copy it now. If
          you lose it, revoke it and create a new one.
        </p>

        <label htmlFor={`${id}-token`} className="mt-4 mb-1.5 block text-sm font-medium text-foreground">
          Upload token
        </label>
        <textarea
          ref={fieldRef}
          id={`${id}-token`}
          readOnly
          rows={2}
          value={revealed.token}
          spellCheck={false}
          autoComplete="off"
          className="ledger-control w-full resize-none break-all rounded-lg border border-border px-3 py-2 font-mono text-xs leading-5 text-foreground focus:border-primary focus:outline-none"
        />
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            onClick={() => void copyToken()}
            icon={copyState === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}
          >
            {copyState === 'copied' ? 'Copied' : 'Copy token'}
          </Button>
          <output
            aria-live="polite"
            className={`text-xs ${copyState === 'failed' ? 'text-app-red' : 'text-muted-foreground'}`}
          >
            {copyState === 'copied' && 'Copied to the clipboard.'}
            {copyState === 'failed' && 'Could not copy. The token is selected; copy it by hand.'}
          </output>
        </div>

        <p className="mt-4 text-sm leading-6 text-muted-foreground">
          In the Shortcut, put it in the <code className="font-mono text-xs text-foreground">Authorization</code>{' '}
          header as <code className="font-mono text-xs text-foreground">Bearer &lt;token&gt;</code> and send
          the backup with POST to{' '}
          <code className="break-all font-mono text-xs text-foreground">{uploadUrl}</code>
        </p>

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            Done
          </Button>
        </div>
      </motion.div>
    </dialog>
  )
}
