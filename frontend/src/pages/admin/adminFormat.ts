/**
 * Formatters for the admin page. AI spend is an estimate in US dollars at
 * list prices, so it stays in dollars instead of the app's display currency.
 */

const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const COUNT = new Intl.NumberFormat('en-IN')
const AS_OF = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
const DAY = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' })

/** `$0.00`, `<$0.01` for a real but sub-cent amount, `$12.34`. */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return '<$0.01'
  return USD.format(value)
}

export function formatCount(value: number): string {
  return COUNT.format(value)
}

/** Axis ticks for counts: a small range gets ticks at 0.2 steps, and half a sign-up means nothing, so those stay blank. */
export function formatCountTick(value: number): string {
  return Number.isInteger(value) ? COUNT.format(value) : ''
}

export function formatAsOf(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : AS_OF.format(date)
}

/** A calendar date, or a dash when there is none (an account that never signed in). */
export function formatDay(iso: string | null): string {
  if (!iso) return '-'
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : DAY.format(date)
}

/** The sort key for a nullable ISO time: missing sorts as the oldest. */
export function timeValue(iso: string | null): number {
  const time = iso ? new Date(iso).getTime() : Number.NaN
  return Number.isNaN(time) ? 0 : time
}

export const PROVIDER_LABELS: Readonly<Record<string, string>> = {
  google: 'Google',
  github: 'GitHub',
  other: 'Other or legacy',
}

/** Feature adoption rows, in the order the page lists them. */
export const FEATURE_LABELS: ReadonlyArray<readonly [string, string]> = [
  ['cas_holdings', 'Mutual funds from a CAS'],
  ['push_subscriptions', 'Phone alerts'],
  ['active_upload_tokens', 'Active access tokens'],
  ['bank_alerts', 'Bank-alert inbox'],
  ['saved_views', 'Saved views'],
  ['byok_ai', 'AI on a personal key'],
]

/** Funding source names as the AI settings call them. */
export const FUNDING_LABELS: Readonly<Record<string, string>> = {
  app: 'App Bedrock (shared)',
  personal: 'Personal keys',
  legacy: 'Before funding was recorded',
}
