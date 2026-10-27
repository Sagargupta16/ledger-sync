/**
 * What the alerts panel says about this device, from the server's state down to
 * the tap that turns alerts on: demo mode, the server's check, this browser's
 * support and permission, then "on" or the button. The first line that applies wins.
 */

import type { ReactNode } from 'react'
import { BellRing, Info } from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import type { usePushConfig, useThisDevicePush } from '@/hooks/api/usePushSubscription'
import type { PushSupport } from '@/services/api/pushDevice'

import { FieldHint } from '../sectionPrimitives'

const SUPPORT_HELP: Record<Exclude<PushSupport, 'ready'>, string> = {
  install:
    'On iPhone and iPad, alerts work in the Home Screen app. In Safari tap Share, then Add to Home Screen, open Ledger Sync from the Home Screen and turn alerts on there.',
  update: 'Alerts need iOS or iPadOS 16.4 or later. Update this device, then open the Home Screen app again.',
  unsupported: 'This browser cannot receive push alerts. Chrome, Edge, Firefox and Safari can.',
  'no-worker':
    "The app's service worker is not running here, so alerts cannot be turned on. Reload the page. In local development the service worker is off.",
}
const BLOCKED_HELP =
  "Notifications are blocked for Ledger Sync. Allow them in this device's settings (on iPhone: Settings > Notifications > Ledger Sync), then reload this page."

export function Note({ children, warning = false }: Readonly<{ children: ReactNode; warning?: boolean }>) {
  return (
    <p className={`flex items-start gap-2 text-sm ${warning ? 'text-app-orange' : 'text-muted-foreground'}`}>
      <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  )
}

interface Props {
  isDemoMode: boolean
  config: ReturnType<typeof usePushConfig>
  device: ReturnType<typeof useThisDevicePush>
  /** This browser has a stored device row, so alerts are on here. */
  isOn: boolean
  isEnabling: boolean
  onEnable: () => void
}

export default function PushStatus({ isDemoMode, config, device, isOn, isEnabling, onEnable }: Readonly<Props>) {
  if (isDemoMode) return <Note>Demo mode is read-only. Alerts need your own account.</Note>
  if (config.isError && !config.data) {
    return (
      <ErrorState variant="compact" title="Could not check alerts" message="Check your connection and try again."
        onRetry={() => void config.refetch()} />
    )
  }
  if (!config.data) return <Spinner size="sm" label="Checking alerts" />
  if (!config.data.enabled) return <Note warning>{config.data.reason ?? 'Phone alerts are off on this server.'}</Note>
  if (device.isError) return <Note>Could not read this browser&apos;s alert settings. Reload the page and try again.</Note>
  if (!device.data) return <Spinner size="sm" label="Checking this device" />
  if (device.data.support !== 'ready') return <Note>{SUPPORT_HELP[device.data.support]}</Note>
  if (device.data.permission === 'denied') return <Note warning>{BLOCKED_HELP}</Note>
  if (isOn) {
    return (
      <p className="flex items-center gap-2 text-sm text-foreground">
        <BellRing className="size-4 shrink-0 text-app-green" aria-hidden="true" />
        Alerts are on for this device.
      </p>
    )
  }
  return (
    <div>
      <Button onClick={onEnable} isLoading={isEnabling} icon={<BellRing className="size-4" />}
        className="w-full sm:w-auto">
        Turn on alerts on this device
      </Button>
      <FieldHint>This device asks for permission once. Remove it below at any time.</FieldHint>
    </div>
  )
}
