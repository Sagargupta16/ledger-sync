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

/** `$0.00`, `<$0.01` for a real but sub-cent amount, `$12.34`. */
export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) return '<$0.01'
  return USD.format(value)
}

export function formatCount(value: number): string {
  return COUNT.format(value)
}

export function formatAsOf(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : AS_OF.format(date)
}

/** Funding source names as the AI settings call them. */
export const FUNDING_LABELS: Readonly<Record<string, string>> = {
  app: 'App Bedrock (shared)',
  personal: 'Personal keys',
  legacy: 'Before funding was recorded',
}
