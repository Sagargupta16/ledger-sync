/**
 * A read-only value with a copy button: the one-time token, or the setup
 * command that embeds it. Clipboard access needs a secure context and can be
 * refused; the text is then selected so it can be copied by hand.
 */

import { useId, useRef, useState } from 'react'
import { Check, Copy } from 'lucide-react'

import Button from '@/components/ui/Button'

interface Props {
  label: string
  value: string
  copyLabel: string
  rows?: number
}

export default function UploadTokenCopyField({ label, value, copyLabel, rows = 2 }: Readonly<Props>) {
  const id = useId()
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopyState('copied')
    } catch {
      fieldRef.current?.select()
      setCopyState('failed')
    }
  }

  return (
    <div className="mt-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-foreground">
        {label}
      </label>
      <textarea
        ref={fieldRef}
        id={id}
        readOnly
        rows={rows}
        value={value}
        spellCheck={false}
        autoComplete="off"
        className="ledger-control w-full resize-none break-all rounded-lg border border-border px-3 py-2 font-mono text-xs leading-5 text-foreground focus:border-primary focus:outline-none"
      />
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <Button
          type="button"
          onClick={() => void copy()}
          icon={copyState === 'copied' ? <Check className="size-4" /> : <Copy className="size-4" />}
        >
          {copyState === 'copied' ? 'Copied' : copyLabel}
        </Button>
        <output
          aria-live="polite"
          className={`text-xs ${copyState === 'failed' ? 'text-app-red' : 'text-muted-foreground'}`}
        >
          {copyState === 'copied' && 'Copied to the clipboard.'}
          {copyState === 'failed' && 'Could not copy. The text is selected; copy it by hand.'}
        </output>
      </div>
    </div>
  )
}
