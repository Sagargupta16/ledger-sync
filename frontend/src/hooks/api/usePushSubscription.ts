/**
 * Web Push for Settings > Notifications: the server's status, this browser's
 * state, the device list, and the tap-only actions (turn on, test, remove).
 * Every write captures the session during render, asserts it before dispatch
 * and publishes only into the session that started it. Each mutation handles
 * its own errors, so the panel shows them inline instead of a global toast.
 */

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'

import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import { pushService, type PushDeviceList } from '@/services/api/push'
import { readThisDevice, subscribeThisDevice, unsubscribeThisDevice } from '@/services/api/pushDevice'

export const PUSH_KEY = ['push'] as const
const CONFIG_KEY = [...PUSH_KEY, 'config'] as const
const DEVICES_KEY = [...PUSH_KEY, 'devices'] as const

export interface EnablePushInput {
  publicKey: string
  /** From `askPushPermission()`, called in the tap itself so Safari shows the prompt. */
  permission: Promise<NotificationPermission>
}

export interface RemovePushDeviceInput {
  id: number
  /** Also unsubscribe this browser, so it stops holding a dead subscription. */
  isThisDevice: boolean
}

/** Refetch config, devices and this browser's state, unless the session has ended. */
function refreshPush(queryClient: QueryClient, signal: AbortSignal | undefined) {
  if (!signal || !isCurrentSession(signal)) return
  void queryClient.invalidateQueries({ queryKey: PUSH_KEY })
}

export function usePushConfig() {
  return useQuery({
    queryKey: CONFIG_KEY,
    queryFn: () => pushService.getConfig(),
    staleTime: Infinity,
  })
}

export function usePushDevices(enabled: boolean) {
  return useQuery({
    queryKey: DEVICES_KEY,
    queryFn: () => pushService.listDevices(),
    staleTime: Infinity,
    enabled,
  })
}

/** Browser-only state (support, permission, this subscription), cached per server key. */
export function useThisDevicePush(publicKey: string | null | undefined) {
  return useQuery({
    queryKey: [...PUSH_KEY, 'this-device', publicKey ?? null],
    queryFn: () => readThisDevice(publicKey ?? null),
    staleTime: Infinity,
    retry: false,
    // Wait for the config, which says which key a current subscription must use.
    enabled: publicKey !== undefined,
  })
}

/** Subscribe this browser once the permission asked for in the tap is granted, and store it. */
export function useEnablePush() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...PUSH_KEY, 'enable', getSessionGeneration()],
    mutationFn: async ({ publicKey, permission }: EnablePushInput) => {
      assertCurrentSession(sessionSignal)
      const subscription = await subscribeThisDevice(publicKey, permission)
      assertCurrentSession(sessionSignal)
      return pushService.addDevice(subscription)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_device, _key, signal) => refreshPush(queryClient, signal),
    // A refused permission or a full device list still changes what to show.
    onError: (_error, _key, signal) => refreshPush(queryClient, signal),
  })
}

/** Send the test alert to one device, or to every device when the id is undefined. */
export function useSendTestPush() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...PUSH_KEY, 'test', getSessionGeneration()],
    mutationFn: (deviceId: number | undefined) => {
      assertCurrentSession(sessionSignal)
      return pushService.sendTest(deviceId)
    },
    onMutate: () => sessionSignal,
    // The send updates last-alert times and can remove expired devices.
    onSuccess: (_report, _id, signal) => refreshPush(queryClient, signal),
    onError: (_error, _id, signal) => refreshPush(queryClient, signal),
  })
}

export function useRemovePushDevice() {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()

  return useMutation({
    mutationKey: [...PUSH_KEY, 'remove', getSessionGeneration()],
    mutationFn: async ({ id, isThisDevice }: RemovePushDeviceInput) => {
      assertCurrentSession(sessionSignal)
      await pushService.removeDevice(id)
      if (isThisDevice) await unsubscribeThisDevice().catch(() => undefined)
    },
    onMutate: () => sessionSignal,
    onSuccess: (_data, { id }, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      // Drop the row at once, so a removed device never reads as on.
      queryClient.setQueryData<PushDeviceList>(DEVICES_KEY, (list) =>
        list && { ...list, devices: list.devices.filter((device) => device.id !== id) })
      refreshPush(queryClient, signal)
    },
    onError: (_error, _input, signal) => refreshPush(queryClient, signal),
  })
}
