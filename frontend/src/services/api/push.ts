/**
 * Web Push alerts (backend `api/push.py`). The server sends what Settings >
 * Notifications saved (bills due, budgets near their limit, anomalies to
 * review) as short alerts without amounts, once a day. The VAPID public key in
 * the config is public by design: the browser needs it to subscribe. No route
 * returns an endpoint URL, a private key or a secret.
 */

import { apiClient } from './client'

/** `GET /api/push/config`: whether the server can send, and what is missing. */
export interface PushConfig {
  enabled: boolean
  /** The daily run also needs CRON_SECRET on the server; test alerts work without it. */
  daily_alerts: boolean
  public_key: string | null
  /** Names of unset server variables, never their values. */
  missing: string[]
  reason: string | null
}

/** A device with alerts on. */
export interface PushDevice {
  id: number
  label: string
  /** SHA-256 of the endpoint, so this browser can find its own row. */
  endpoint_hash: string
  created_at: string
  last_success_at: string | null
}

export interface PushDeviceList {
  devices: PushDevice[]
  /** The most devices one account can have alerts on. */
  limit: number
}

export interface PushDeliveryReport {
  sent: number
  failed: number
  /** Devices whose subscription had expired and were removed. */
  removed: number
}

/** `PushSubscription.toJSON()` plus the device-list label. */
export interface PushSubscriptionInput {
  endpoint: string
  keys: { p256dh: string; auth: string }
  label: string
}

/** Sign-out waits this long at most to forget the device before it revokes the session. */
const FORGET_TIMEOUT_MS = 4000

export const pushService = {
  getConfig: async (): Promise<PushConfig> => {
    const response = await apiClient.get<PushConfig>('/api/push/config')
    return response.data
  },

  listDevices: async (): Promise<PushDeviceList> => {
    const response = await apiClient.get<PushDeviceList>('/api/push/subscriptions')
    return response.data
  },

  addDevice: async (subscription: PushSubscriptionInput): Promise<PushDevice> => {
    const response = await apiClient.post<PushDevice>('/api/push/subscriptions', subscription)
    return response.data
  },

  removeDevice: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/push/subscriptions/${id}`)
  },

  /**
   * Drop this browser's row by its endpoint; an unknown endpoint is not an error.
   * An axios timeout rather than an AbortSignal: the client merges a passed
   * signal with `AbortSignal.any`, which iOS 16.4 to 17.3 lack.
   */
  forgetEndpoint: async (endpoint: string): Promise<void> => {
    await apiClient.post('/api/push/subscriptions/unsubscribe', { endpoint }, { timeout: FORGET_TIMEOUT_MS })
  },

  /** One device by id, or every device of the account when `deviceId` is omitted. */
  sendTest: async (deviceId?: number): Promise<PushDeliveryReport> => {
    const response = await apiClient.post<PushDeliveryReport>('/api/push/test', {
      device_id: deviceId ?? null,
    })
    return response.data
  },
}
