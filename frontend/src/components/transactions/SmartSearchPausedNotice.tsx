import { Info } from 'lucide-react'

import { Button } from '@/components/ui'

interface SmartSearchPausedNoticeProps {
  /** The server's reason smart search cannot run right now. */
  message: string
  onRetry: () => void
}

/** Smart search stepped aside, so the search box is matching words again. */
export default function SmartSearchPausedNotice({
  message,
  onRetry,
}: Readonly<SmartSearchPausedNoticeProps>) {
  return (
    <div
      role="status"
      className="ledger-panel flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-xs leading-5 text-text-secondary"
    >
      <Info className="size-4 shrink-0 text-app-orange" aria-hidden />
      <p className="min-w-0 flex-1">{message} The search box is matching words instead.</p>
      <Button type="button" variant="ghost" size="sm" onClick={onRetry} className="shrink-0">
        Try smart search again
      </Button>
    </div>
  )
}
