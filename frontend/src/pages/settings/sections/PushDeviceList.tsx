/**
 * Devices with alerts on: their name, when they were added, the last alert that
 * reached them, and a remove action. Removing this browser also unsubscribes it.
 */

import { useId, type ReactNode } from 'react'
import { BellOff, Trash2 } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import Button from '@/components/ui/Button'
import Spinner from '@/components/ui/Spinner'
import { formatDate } from '@/lib/formatters'
import type { PushDevice, PushDeviceList as DeviceList } from '@/services/api/push'

interface Props {
  list: DeviceList | undefined
  isLoading: boolean
  isError: boolean
  onRetry: () => void
  thisDeviceId: number | undefined
  /** The device being removed; other removes wait until it settles. */
  removingId: number | undefined
  removeError: { id: number; message: string } | null
  onRemove: (device: PushDevice) => void
}

const DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }
const DATE_TIME: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }

function DeviceDate({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex justify-between gap-3 sm:block">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground sm:text-left">{value}</dd>
    </div>
  )
}

export default function PushDeviceList(props: Readonly<Props>) {
  const { list, isLoading, isError, onRetry, thisDeviceId, removingId, removeError, onRemove } = props
  const headingId = useId()

  let body: ReactNode
  if (isError && !list) {
    body = (
      <ErrorState
        variant="compact"
        title="Could not load your devices"
        message="Nothing was changed. Check your connection and try again."
        onRetry={onRetry}
      />
    )
  } else if (isLoading || !list) {
    body = <Spinner size="sm" label="Loading devices" />
  } else if (list.devices.length === 0) {
    body = (
      <EmptyState
        variant="compact"
        icon={BellOff}
        title="No devices yet"
        description="Turn alerts on above on each phone or browser that should get them."
      />
    )
  } else {
    body = (
      <ul aria-labelledby={headingId} className="space-y-2">
        {list.devices.map((device) => (
          <li key={device.id} className="rounded-lg border border-border bg-[var(--overlay-1)] p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="break-words text-sm font-medium text-foreground">{device.label}</p>
                {device.id === thisDeviceId && (
                  <span className="mt-1.5 inline-flex rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
                    This device
                  </span>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onRemove(device)}
                disabled={removingId !== undefined}
                isLoading={removingId === device.id}
                aria-label={`Stop alerts on ${device.label}`}
                icon={<Trash2 className="size-4" />}
                className="shrink-0 text-app-red hover:bg-app-red/10 hover:text-app-red"
              >
                {removingId === device.id ? 'Removing...' : 'Remove'}
              </Button>
            </div>
            <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-2 sm:gap-3">
              <DeviceDate label="Added" value={formatDate(new Date(device.created_at), DATE)} />
              <DeviceDate
                label="Last alert"
                value={device.last_success_at ? formatDate(new Date(device.last_success_at), DATE_TIME) : 'None yet'}
              />
            </dl>
            {removeError?.id === device.id && (
              <p role="alert" className="mt-2 text-sm text-app-red">
                Could not remove this device. {removeError.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="space-y-3 border-t border-border pt-4">
      <div className="flex items-baseline justify-between gap-3">
        <h4 id={headingId} className="text-sm font-medium text-foreground">Devices with alerts on</h4>
        {list && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {list.devices.length} of {list.limit}
          </span>
        )}
      </div>
      {body}
    </div>
  )
}
