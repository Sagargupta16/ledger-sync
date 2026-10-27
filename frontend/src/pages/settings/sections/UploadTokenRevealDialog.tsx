/**
 * One-time display of a new access token, with how to use it for its purpose.
 *
 * The server returns the plaintext only in the create response, so this is
 * the only time it appears. The section holds it in state and clears it when
 * this closes. A tap on the backdrop does not close it, so a stray touch
 * cannot discard a token before it is copied; Done and Escape do. An MCP
 * token also comes as a ready-to-run `claude mcp add` command.
 *
 * Same native `<dialog>` shell and motion as ConfirmDialog.
 */

import { useEffect, useId, useRef, type RefObject } from 'react'
import { AnimatePresence, motion } from 'motion/react'

import Button from '@/components/ui/Button'
import { DURATION, EASING } from '@/constants/animations'
import { bankAlertIngestUrl } from '@/services/api/bankAlerts'
import {
  LEDGER_READ_SCOPE,
  UPLOAD_SCOPE,
  claudeMcpAddCommand,
  moneyManagerUploadUrl,
  type TokenScope,
} from '@/services/api/uploadTokens'

import UploadTokenCopyField from './UploadTokenCopyField'
import { purposeFor } from './uploadTokenPurposes'

export interface RevealedUploadToken {
  name: string
  scope: TokenScope
  token: string
}

interface Props {
  revealed: RevealedUploadToken | null
  /** Focus target on close: what submitted the create, captured at submit time. */
  returnFocusRef: RefObject<HTMLElement | null>
  onClose: () => void
}

const CODE = 'font-mono text-xs text-foreground'

type ContentProps = Omit<Props, 'revealed'> & { revealed: RevealedUploadToken }

/** How the Shortcut or the alert automation sends the token, what it posts and where. */
function AutomationUsage({ scope }: Readonly<{ scope: TokenScope }>) {
  const upload = scope === UPLOAD_SCOPE
  return (
    <p className="mt-4 text-sm leading-6 text-muted-foreground">
      In the {upload ? 'Shortcut' : 'automation that forwards your bank alerts'}, put it in the{' '}
      <code className={CODE}>Authorization</code> header as{' '}
      <code className={CODE}>Bearer &lt;token&gt;</code> and send{' '}
      {upload ? 'the backup' : 'each alert as JSON with a text field'} with POST to{' '}
      <code className={`break-all ${CODE}`}>{upload ? moneyManagerUploadUrl() : bankAlertIngestUrl()}</code>
    </p>
  )
}

export default function UploadTokenRevealDialog({ revealed, ...props }: Readonly<Props>) {
  return (
    <AnimatePresence>
      {revealed && <RevealContent revealed={revealed} {...props} />}
    </AnimatePresence>
  )
}

function RevealContent({ revealed, returnFocusRef, onClose }: Readonly<ContentProps>) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const id = useId()
  const purpose = purposeFor(revealed.scope)

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
          {purpose.revealTitle}
        </h3>
        <p id={`${id}-desc`} className="mt-2 break-words text-sm leading-6 text-muted-foreground">
          This is the token for "{revealed.name}". It won't be shown again, so copy it now. If
          you lose it, revoke it and create a new one.
        </p>

        <UploadTokenCopyField label={purpose.tokenLabel} value={revealed.token} copyLabel="Copy token" />

        {revealed.scope === LEDGER_READ_SCOPE ? (
          <>
            {/* About 160 characters, six lines of 12px mono on a 320px screen. */}
            <UploadTokenCopyField
              label="Claude Code command"
              value={claudeMcpAddCommand(revealed.token)}
              copyLabel="Copy command"
              rows={6}
            />
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Run it in a terminal, then ask Claude about your money. It reads your ledger with
              read-only tools and cannot change anything.
            </p>
          </>
        ) : (
          <AutomationUsage scope={revealed.scope} />
        )}

        <div className="mt-6 flex justify-end">
          <Button type="button" variant="secondary" size="lg" onClick={onClose}>
            Done
          </Button>
        </div>
      </motion.div>
    </dialog>
  )
}
