import { useEffect, useId, useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw, Smartphone } from 'lucide-react'

import { Button, Card } from '@/components/ui'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { getSessionSignal, isCurrentSession } from '@/lib/session'
import { purposeFor } from '@/pages/settings/sections/uploadTokenPurposes'
import { UPLOAD_SCOPE } from '@/services/api/uploadTokens'

import {
  isAppleMobile,
  MONEY_MANAGER_SHORTCUT_NAME,
  moneyManagerShortcutUrl,
} from '../moneyManagerUtils'

/** Where the Shortcut's token is made, named as Settings names the section and the purpose. */
const TOKEN_SOURCE = `Settings > Advanced > Access Tokens (${purposeFor(UPLOAD_SCOPE).label})`

interface MoneyManagerShortcutButtonProps {
  /**
   * Set while an upload runs or a review is open: a Shortcut started then could
   * save a newer backup that confirming the older, reviewed one would replace.
   */
  readonly disabled: boolean
}

/**
 * On an iPhone or iPad, one tap runs the iOS Shortcut that uploads Money
 * Manager's newest backup with an upload token. Elsewhere the same button
 * explains the share-sheet route instead. It makes no request of its own.
 */
export default function MoneyManagerShortcutButton({ disabled }: MoneyManagerShortcutButtonProps) {
  const queryClient = useQueryClient()
  const { guardDemoAction } = useDemoGuard()
  const [onApple] = useState(() => typeof navigator !== 'undefined' && isAppleMobile())
  const [awaitingReturn, setAwaitingReturn] = useState(false)
  const [opened, setOpened] = useState(false)
  const [showSteps, setShowSteps] = useState(false)
  const titleId = useId()
  const stepsId = useId()

  // Back from Shortcuts: refetch what this page shows, so Import history lists the upload.
  useEffect(() => {
    if (!awaitingReturn) return
    const signal = getSessionSignal()
    const onReturn = () => {
      if (document.visibilityState !== 'visible') return
      // Once per launch, even if the page flips visibility again before React re-renders.
      document.removeEventListener('visibilitychange', onReturn)
      setAwaitingReturn(false)
      setOpened(false)
      if (isCurrentSession(signal)) void queryClient.invalidateQueries()
    }
    document.addEventListener('visibilitychange', onReturn)
    return () => document.removeEventListener('visibilitychange', onReturn)
  }, [awaitingReturn, queryClient])

  const handleSync = () => {
    if (guardDemoAction('Money Manager sync')) return
    if (!onApple) {
      setShowSteps((open) => !open)
      return
    }
    setOpened(true)
    setAwaitingReturn(true)
    globalThis.location.assign(moneyManagerShortcutUrl())
  }

  return (
    <section aria-labelledby={titleId}>
      {/* gap, not space-y: the hidden steps must not leave a margin behind. */}
      <Card className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
            <div className="min-w-0">
              <h2 id={titleId} className="text-sm font-semibold text-foreground">
                One-tap sync from Money Manager
              </h2>
              <p className="mt-1 text-pretty text-sm leading-6 text-muted-foreground">
                Runs the <span className="font-medium text-foreground">{MONEY_MANAGER_SHORTCUT_NAME}</span>{' '}
                shortcut on your iPhone, which sends the newest backup here with a token from{' '}
                {TOKEN_SOURCE}.
              </p>
            </div>
          </div>
          <Button
            variant="secondary"
            onClick={handleSync}
            disabled={disabled}
            icon={<RefreshCw className="size-4" aria-hidden="true" />}
            aria-expanded={onApple ? undefined : showSteps}
            aria-controls={onApple ? undefined : stepsId}
            className="w-full sm:w-auto sm:shrink-0"
          >
            Sync from Money Manager
          </Button>
        </div>

        {opened && (
          <p role="status" className="text-sm leading-6 text-muted-foreground">
            Opening Shortcuts. If it cannot find {MONEY_MANAGER_SHORTCUT_NAME}, create that shortcut
            first, then tap again.
          </p>
        )}

        {!onApple && (
          <div
            id={stepsId}
            hidden={!showSteps}
            className="space-y-2 border-t border-border pt-4 text-sm leading-6 text-muted-foreground"
          >
            <p>
              This button runs an iOS Shortcut, so it works on an iPhone or iPad. To sync from the
              phone without opening this page:
            </p>
            <ol className="list-decimal space-y-1 pl-5">
              <li>
                Create a token in {TOKEN_SOURCE}, and the {MONEY_MANAGER_SHORTCUT_NAME} shortcut
                that uses it.
              </li>
              <li>Turn on the shortcut&apos;s Show in Share Sheet.</li>
              <li>
                In Money Manager, open More &gt; Backup &gt; Export and choose{' '}
                {MONEY_MANAGER_SHORTCUT_NAME}.
              </li>
            </ol>
            <p>On this device, export the .mmbak backup and drop it on the upload area above.</p>
          </div>
        )}
      </Card>
    </section>
  )
}
