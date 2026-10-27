/**
 * Demo twins of the Web Push reads (backend `api/push.py`): `GET
 * /api/push/config` and `GET /api/push/subscriptions`.
 *
 * The sample workspace has no account to hold a device and demo mode blocks
 * every write, so alerts read as off and no device has them. Only type imports
 * from the services layer: `services/api/client.ts` imports this module.
 */

import type { PushConfig, PushDeviceList } from '@/services/api/push'

/** Matches the backend's per-account device limit (`core/push_devices.MAX_DEVICES`). */
const DEMO_DEVICE_LIMIT = 10

export function generateDemoPushConfig(): PushConfig {
  return {
    enabled: false,
    daily_alerts: false,
    public_key: null,
    missing: [],
    reason: 'The demo cannot receive alerts. Sign in with your own account to turn them on.',
  }
}

export function generateDemoPushDevices(): PushDeviceList {
  return { devices: [], limit: DEMO_DEVICE_LIMIT }
}
