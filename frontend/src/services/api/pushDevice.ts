/**
 * This browser's side of Web Push: whether it can receive alerts, its current
 * subscription, subscribing from a tap, and forgetting it on sign-out.
 *
 * iPhone and iPad get Web Push only in a Home Screen app on iOS 16.4 or later,
 * where `PushManager` exists; a Safari tab or an in-app browser has none, so
 * Settings asks to add the app instead. Permission is requested only from the
 * "Turn on alerts" tap, because Safari shows the prompt only for a user gesture.
 */

import { isDemoMode } from '@/store/demoStore'

import { pushService, type PushSubscriptionInput } from './push'

/** `install`: an iPhone or iPad outside the Home Screen app; `update`: iOS before 16.4. */
export type PushSupport = 'ready' | 'install' | 'update' | 'unsupported' | 'no-worker'

export interface ThisDevice {
  support: PushSupport
  permission: NotificationPermission
  /** Set when this browser holds a subscription made with the server's current key. */
  endpointHash: string | null
}

export class PushPermissionError extends Error {
  readonly permission: NotificationPermission

  constructor(permission: NotificationPermission) {
    super(permission === 'denied'
      ? 'Notifications are blocked for Ledger Sync on this device.'
      : 'Notifications were not allowed, so alerts stay off.')
    this.name = 'PushPermissionError'
    this.permission = permission
  }
}

/** How long a tap waits for the service worker to activate on a first visit. */
const WORKER_WAIT_MS = 4000

const DEVICES: ReadonlyArray<readonly [RegExp, string]> = [
  [/iPhone|iPod/, 'iPhone'],
  [/iPad/, 'iPad'],
  [/Android/, 'Android'],
  [/CrOS/, 'Chromebook'],
  [/Macintosh/, 'Mac'],
  [/Windows/, 'Windows'],
  [/Linux/, 'Linux'],
]
// Order matters: Edge, Samsung Internet and Opera also say "Chrome".
const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/Edg(?:A|iOS)?\//, 'Edge'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/OPR\//, 'Opera'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Chrome\/|CriOS/, 'Chrome'],
  [/Safari\//, 'Safari'],
]

/** iPadOS sends a Mac user agent; its touch points give it away. */
const isIPadOS = (): boolean => navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1

function isAppleMobile(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || isIPadOS()
}

function isStandalone(): boolean {
  return globalThis.matchMedia?.('(display-mode: standalone)').matches === true
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

function canPush(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in globalThis && 'Notification' in globalThis
}

function pushSupport(): PushSupport {
  if (canPush()) return 'ready'
  if (isAppleMobile()) return isStandalone() ? 'update' : 'install'
  return 'unsupported'
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replaceAll('-', '+').replaceAll('_', '/')
  const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
  return Uint8Array.from(binary, (char) => char.codePointAt(0) ?? 0)
}

/** Whether `subscription` was made with this server's current public key. */
function usesKey(subscription: PushSubscription, publicKey: string): boolean {
  const key = subscription.options.applicationServerKey
  if (!key) return false
  const stored = new Uint8Array(key)
  const current = base64UrlToBytes(publicKey)
  return stored.length === current.length && stored.every((byte, index) => byte === current[index])
}

async function endpointHash(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(endpoint))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** The registration that controls this page, without waiting; null when none exists (local dev). */
async function existingRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!canPush()) return null
  return (await navigator.serviceWorker.getRegistration()) ?? null
}

async function existingSubscription(): Promise<PushSubscription | null> {
  const registration = await existingRegistration()
  return registration ? registration.pushManager.getSubscription().catch(() => null) : null
}

/** A short device-list name: "iPhone app", "Chrome on Android", "Safari on Mac". */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const device = isIPadOS() ? 'iPad' : DEVICES.find(([pattern]) => pattern.test(ua))?.[1] ?? 'Computer'
  if (isStandalone()) return `${device} app`
  const browser = BROWSERS.find(([pattern]) => pattern.test(ua))?.[1] ?? 'Browser'
  return `${browser} on ${device}`
}

export async function readThisDevice(publicKey: string | null): Promise<ThisDevice> {
  const support = pushSupport()
  if (support !== 'ready') return { support, permission: 'default', endpointHash: null }
  const registration = await existingRegistration()
  const permission = Notification.permission
  if (!registration) return { support: 'no-worker', permission, endpointHash: null }
  const subscription = await registration.pushManager.getSubscription().catch(() => null)
  const current = subscription && publicKey && usesKey(subscription, publicKey) ? subscription : null
  return { support, permission, endpointHash: current ? await endpointHash(current.endpoint) : null }
}

/**
 * Ask for notification permission. Call it synchronously in the tap handler,
 * before anything is awaited: Safari shows the prompt only for a short-running
 * user-gesture handler, and the mutation behind the tap reaches its function
 * several promise hops later.
 */
export function askPushPermission(): Promise<NotificationPermission> {
  return Notification.requestPermission()
}

/**
 * Subscribe this browser with the server's key once the permission asked for
 * with `askPushPermission` in the tap is granted.
 */
export async function subscribeThisDevice(
  publicKey: string,
  asked: Promise<NotificationPermission>,
): Promise<PushSubscriptionInput> {
  const permission = await asked
  if (permission !== 'granted') throw new PushPermissionError(permission)
  const timeout = new Promise<null>((resolve) => { setTimeout(() => resolve(null), WORKER_WAIT_MS) })
  const registration = await Promise.race([navigator.serviceWorker.ready, timeout])
  if (!registration) throw new Error('The app is still installing its offline files. Reload the page and try again.')
  let subscription = await registration.pushManager.getSubscription()
  if (subscription && !usesKey(subscription, publicKey)) {
    // Made with an older server key: it can never receive this server's pushes,
    // so drop its row too rather than leave a device that always fails.
    await pushService.forgetEndpoint(subscription.endpoint).catch(() => undefined)
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: base64UrlToBytes(publicKey),
  })
  const { endpoint, keys } = subscription.toJSON()
  if (!endpoint || !keys?.p256dh || !keys.auth) throw new Error('This browser returned an incomplete subscription.')
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth }, label: deviceLabel() }
}

/** Unsubscribe locally; the server drops the row the next time the push service says it is gone. */
export async function unsubscribeThisDevice(): Promise<void> {
  const subscription = await existingSubscription()
  if (subscription) await subscription.unsubscribe()
}

/**
 * Sign-out: stop alerts to this device while the session can still authorise
 * that, then unsubscribe locally. Never throws, so sign-out always finishes.
 * A demo session never subscribes, and leaves a real account's device alone.
 */
export async function forgetThisDevice(): Promise<void> {
  if (isDemoMode()) return
  try {
    const subscription = await existingSubscription()
    if (!subscription) return
    await pushService.forgetEndpoint(subscription.endpoint).catch(() => undefined)
    await subscription.unsubscribe()
  } catch {
    // Best effort: a row left behind is removed on its next 404 or 410.
  }
}
