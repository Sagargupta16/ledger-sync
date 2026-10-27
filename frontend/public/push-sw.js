/*
 * Push alerts for Ledger Sync, loaded into the generated Workbox service
 * worker through `workbox.importScripts` in vite.config.ts.
 *
 * The backend (core/push_sender.py) sends Declarative Web Push JSON:
 *   { "web_push": 8030,
 *     "notification": { "title", "body", "navigate", "tag", "icon", "lang", "dir", "data" },
 *     "app_badge": "3" }
 * iOS and iPadOS 18.4+ Home Screen apps show that themselves. Older iOS,
 * Android and desktop browsers fire `push` here with the same JSON, so this
 * shows the same notification and sets the badge. Every push must show a
 * notification: Safari withdraws the permission after silent pushes.
 */

const APP_URL = new URL('./', self.registration.scope).href
const DIRECTIONS = new Set(['auto', 'ltr', 'rtl'])

function readMessage(event) {
  try {
    const message = event.data ? event.data.json() : null
    const notification = message && message.notification
    if (notification && typeof notification.title === 'string' && notification.title) {
      return { message, notification }
    }
  } catch {
    // Not JSON: show the generic alert below rather than nothing.
  }
  return null
}

/** Only ever open this app's own pages. */
function appUrl(value) {
  if (typeof value !== 'string' || !value) return APP_URL
  try {
    const url = new URL(value, APP_URL)
    return url.origin === self.location.origin ? url.href : APP_URL
  } catch {
    return APP_URL
  }
}

function badgeCount(parsed) {
  const raw = parsed.message.app_badge ?? parsed.notification.app_badge
  const count = Number(raw)
  return raw !== undefined && Number.isInteger(count) && count >= 0 ? count : null
}

async function setBadge(count) {
  if (count === null || !('setAppBadge' in self.navigator)) return
  try {
    if (count === 0) await self.navigator.clearAppBadge()
    else await self.navigator.setAppBadge(count)
  } catch {
    // Badges are best effort; some platforms refuse them.
  }
}

self.addEventListener('push', (event) => {
  const parsed = readMessage(event)
  const notification = parsed ? parsed.notification : {}
  const tag = typeof notification.tag === 'string' && notification.tag ? notification.tag : undefined
  const options = {
    body: typeof notification.body === 'string' ? notification.body : 'Open Ledger Sync to see what changed.',
    icon: typeof notification.icon === 'string' ? appUrl(notification.icon) : undefined,
    lang: typeof notification.lang === 'string' ? notification.lang : undefined,
    dir: DIRECTIONS.has(notification.dir) ? notification.dir : undefined,
    tag,
    // A replacement for an alert of the same kind still buzzes.
    renotify: tag !== undefined,
    data: { url: appUrl(notification.navigate) },
  }
  const title = parsed ? notification.title : 'Ledger Sync'
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    setBadge(parsed ? badgeCount(parsed) : null),
  ]))
})

async function openApp(url) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  // Under the app's own scope, not just its origin: the personal site at
  // sagargupta.online shares the origin, and its tab may be the one focused last.
  const open = windows.find((client) => client.url.startsWith(APP_URL))
  if (open) {
    try {
      const focused = await open.focus()
      if (focused && focused.url !== url && 'navigate' in focused) await focused.navigate(url)
      return
    } catch {
      // An uncontrolled window cannot be navigated from here; open a new one.
    }
  }
  if (self.clients.openWindow) await self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const data = event.notification.data
  event.waitUntil(openApp(data && typeof data.url === 'string' ? data.url : APP_URL))
})
