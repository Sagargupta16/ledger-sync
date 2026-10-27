/**
 * Alerts on this device: Web Push for the saved choices above. "Turn on alerts
 * on this device" is one tap that asks for notification permission and
 * subscribes this browser. It appears only where push works (an iPhone or iPad
 * Home Screen app on iOS 16.4 or later, or a browser with PushManager); other
 * devices get the step that would make it work. Actions apply at once, outside
 * the page's Save, like access tokens. Alerts never show amounts.
 */

import { Send, Smartphone } from 'lucide-react'
import { toast } from 'sonner'

import Button from '@/components/ui/Button'
import {
  useEnablePush, usePushConfig, usePushDevices, useRemovePushDevice, useSendTestPush, useThisDevicePush,
} from '@/hooks/api/usePushSubscription'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { isCurrentSession } from '@/lib/session'
import type { PushDeliveryReport, PushDevice } from '@/services/api/push'
import { askPushPermission } from '@/services/api/pushDevice'
import { useDemoStore } from '@/store/demoStore'

import { FieldHint } from '../sectionPrimitives'
import PushDeviceList from './PushDeviceList'
import PushStatus, { Note } from './PushStatus'

/** Runs `then` only while the session that started the action is still the current one. */
function whenCurrent(signal: AbortSignal | undefined, then: () => void) {
  if (signal && isCurrentSession(signal)) then()
}

/** The failed remove, if any, for the row it belongs to. */
function removeFailure(remove: ReturnType<typeof useRemovePushDevice>) {
  if (!remove.isError || !remove.variables) return null
  return { id: remove.variables.id, message: getApiErrorMessage(remove.error, 'Please try again.') }
}

function announceTest(report: PushDeliveryReport) {
  if (report.removed > 0) {
    toast.warning('A device had stopped accepting alerts, so it was removed. Turn alerts on there again.')
  } else if (report.sent > 0) {
    toast.success(`Test alert sent to ${report.sent} ${report.sent === 1 ? 'device' : 'devices'}.`)
  } else {
    toast.error('The push service did not accept the test alert. Try again later.')
  }
}

export default function PushAlertsPanel() {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const config = usePushConfig()
  const devices = usePushDevices(!isDemoMode)
  const device = useThisDevicePush(config.data?.public_key)
  const enable = useEnablePush()
  const test = useSendTestPush()
  const remove = useRemovePushDevice()

  const hash = device.data?.endpointHash
  const thisDevice = devices.data?.devices.find((row) => row.endpoint_hash === hash)
  const hasDevices = Boolean(devices.data?.devices.length)
  const enabled = !isDemoMode && config.data?.enabled === true

  const handleEnable = () => {
    const key = config.data?.public_key
    if (!key || enable.isPending) return
    test.reset()
    // Asked here, in the tap itself: Safari shows the prompt only for a user gesture.
    enable.mutate({ publicKey: key, permission: askPushPermission() }, {
      onSuccess: (_row, _input, signal) =>
        whenCurrent(signal, () => toast.success('Alerts are on for this device.')),
    })
  }

  const handleTest = () => {
    test.mutate(thisDevice?.id, {
      onSuccess: (report, _id, signal) => whenCurrent(signal, () => announceTest(report)),
    })
  }

  const handleRemove = (row: PushDevice) => {
    remove.reset()
    remove.mutate({ id: row.id, isThisDevice: row.id === thisDevice?.id }, {
      onSuccess: (_data, _input, signal) =>
        whenCurrent(signal, () => toast.success(`Alerts stopped on ${row.label}.`)),
    })
  }

  return (
    <div className="space-y-4 border-t border-border pt-4">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <p className="text-sm font-medium text-foreground">Alerts on this device</p>
          <p className="text-xs text-muted-foreground">
            Once a day, between about 8:30 and 9:30 IST, the server sends what is new for the saved
            choices above. Alerts show counts and timing, never amounts, because they appear on the
            lock screen.
          </p>
        </div>
      </div>

      <PushStatus
        isDemoMode={isDemoMode}
        config={config}
        device={device}
        isOn={thisDevice !== undefined}
        isEnabling={enable.isPending}
        onEnable={handleEnable}
      />
      {enable.isError && (
        <p role="alert" className="text-sm text-app-red">
          {getApiErrorMessage(enable.error, 'Could not turn on alerts. Please try again.')}
        </p>
      )}

      {enabled && !config.data?.daily_alerts && config.data?.reason && <Note>{config.data.reason}</Note>}

      {enabled && hasDevices && (
        <div>
          <Button variant="secondary" onClick={handleTest} isLoading={test.isPending}
            icon={<Send className="size-4" />} className="w-full sm:w-auto">
            Send a test
          </Button>
          <FieldHint>{thisDevice ? 'Sends to this device.' : 'Sends to every device listed below.'}</FieldHint>
          {test.isError && (
            <p role="alert" className="mt-2 text-sm text-app-red">
              {getApiErrorMessage(test.error, 'Could not send the test alert. Please try again.')}
            </p>
          )}
        </div>
      )}

      {!isDemoMode && (enabled || hasDevices) && (
        <PushDeviceList
          list={devices.data}
          isLoading={devices.isLoading}
          isError={devices.isError}
          onRetry={() => void devices.refetch()}
          thisDeviceId={thisDevice?.id}
          removingId={remove.isPending ? remove.variables?.id : undefined}
          removeError={removeFailure(remove)}
          onRemove={handleRemove}
        />
      )}
    </div>
  )
}
