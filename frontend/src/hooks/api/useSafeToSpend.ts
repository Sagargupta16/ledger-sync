/**
 * Safe to spend until payday, the 30-day balance projection, and the
 * low-balance threshold both of them flag against.
 */

import { useCallback, useSyncExternalStore } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'

import { analyticsV2Keys } from '@/hooks/api/useAnalyticsV2'
import { getTodayKey } from '@/lib/dateUtils'
import { sessionIdentity } from '@/lib/session'
import { safeToSpendService } from '@/services/api/safeToSpend'
import { useAuthStore } from '@/store/authStore'

/**
 * Nested under `analyticsV2Keys.all`: an upload, a recurring edit and every
 * settings save (payday, account classifications, excluded accounts) sweep
 * that family, and each of them changes these figures. Every request param is
 * in the key. So is the IST day from `useLedgerDay`: days left and the per-day
 * allowance move at midnight with no other event, and staleTime is Infinity.
 */
export const safeToSpendKeys = {
  all: [...analyticsV2Keys.all, 'safe-to-spend'] as const,
  summary: (threshold: number, day: string) =>
    [...safeToSpendKeys.all, 'summary', threshold, day] as const,
  projection: (days: number, threshold: number, day: string) =>
    [...safeToSpendKeys.all, 'projection', days, threshold, day] as const,
}

/** How often an open page re-reads the IST day; it re-renders only when the day changes. */
const DAY_CHECK_MS = 60_000

function subscribeToDay(onChange: () => void) {
  const timer = globalThis.setInterval(onChange, DAY_CHECK_MS)
  document.addEventListener('visibilitychange', onChange)
  return () => {
    globalThis.clearInterval(timer)
    document.removeEventListener('visibilitychange', onChange)
  }
}

const readDay = () => getTodayKey()

/**
 * Today's IST key, re-read every minute and whenever the page is shown again,
 * so a Dashboard left open past midnight asks for the new day's figure.
 */
export function useLedgerDay(): string {
  return useSyncExternalStore(subscribeToDay, readDay)
}

export function useSafeToSpend(threshold: number) {
  const day = useLedgerDay()
  return useQuery({
    queryKey: safeToSpendKeys.summary(threshold, day),
    queryFn: () => safeToSpendService.getSafeToSpend({ threshold }),
    staleTime: Infinity,
    // A threshold edit keeps the card on screen while the warning refetches.
    placeholderData: keepPreviousData,
  })
}

export function useBalanceProjection(days: number, threshold: number) {
  const day = useLedgerDay()
  return useQuery({
    queryKey: safeToSpendKeys.projection(days, threshold, day),
    queryFn: () => safeToSpendService.getBalanceProjection({ days, threshold }),
    staleTime: Infinity,
    placeholderData: keepPreviousData,
  })
}

/**
 * The threshold is a device setting, stored per signed-in identity (the
 * notification dismissals' pattern), so one account's figure never applies to
 * another on a shared phone. No server preference exists for it yet.
 */
const THRESHOLD_KEY_PREFIX = 'ledger-sync-low-balance-threshold'
const listeners = new Set<() => void>()

/** The API's ceiling (`le` on `threshold`); anything above it is rejected with 422. */
export const MAX_LOW_BALANCE_THRESHOLD = 1_000_000_000_000

/**
 * Whole rupees from 0 to the API's ceiling, so a stored or typed value can
 * never make every load fail: a rejected threshold would keep the card in its
 * error state, where the form that could fix it is not shown.
 */
function toThreshold(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.round(value), MAX_LOW_BALANCE_THRESHOLD) : 0
}

function readThreshold(storageKey: string): number {
  try {
    return toThreshold(Number(localStorage.getItem(storageKey) ?? 0))
  } catch {
    // Storage blocked (private mode): fall back to flagging only below zero.
    return 0
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  // Another tab saving a threshold updates this one too.
  globalThis.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    globalThis.removeEventListener('storage', listener)
  }
}

/** `[threshold, setThreshold]` in INR; 0 means flag only a fall below zero. */
export function useLowBalanceThreshold(): readonly [number, (value: number) => void] {
  const storageKey = useAuthStore((state) => `${THRESHOLD_KEY_PREFIX}:${sessionIdentity(state)}`)
  const threshold = useSyncExternalStore(subscribe, () => readThreshold(storageKey))
  const setThreshold = useCallback((value: number) => {
    const next = toThreshold(value)
    try {
      if (next > 0) localStorage.setItem(storageKey, String(next))
      else localStorage.removeItem(storageKey)
    } catch {
      // Storage blocked: nothing to persist, and the read above keeps 0.
    }
    for (const listener of listeners) listener()
  }, [storageKey])
  return [threshold, setThreshold] as const
}
