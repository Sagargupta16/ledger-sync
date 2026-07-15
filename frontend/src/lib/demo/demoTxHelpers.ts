import type { Transaction } from '@/types'

/** Simple seeded PRNG (LCG) for deterministic output */
export function createRng(seed: number) {
  let s = seed
  return {
    next(): number {
      s = (s * 1664525 + 1013904223) & 0xffffffff
      return (s >>> 0) / 0x100000000
    },
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min
    },
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(this.next() * arr.length)]
    },
  }
}

export type Rng = ReturnType<typeof createRng>

export function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function txId(index: number): string {
  return `demo-${String(index).padStart(5, '0')}`
}

export interface MonthCtx {
  rng: Rng
  txs: Transaction[]
  idx: number
  year: number
  month: number
  m: number
  daysInMonth: number
  /** Net monthly salary credit for this month (grows over the horizon). */
  salaryMonthly: number
  /** Cumulative price-level multiplier for this month (1.0 at m=0). */
  inflation: number
  /** True for the festival season months (Oct/Nov) -- spending spikes. */
  festival: boolean
}

/** Total months of demo history. 48 = four full FYs of data. */
export const DEMO_MONTHS = 48

/**
 * Salary growth model, grounded in India tech-market data:
 * ~9.5%/yr appraisal hikes (Aon/Deel surveys report 9-9.5% for 2023-25)
 * landing every April, plus one 18% promotion bump in the third April.
 * Base: ~1.18L/mo net 48 months ago compounds to ~1.7L/mo today.
 */
export function salaryForMonth(m: number, aprilIndices: readonly number[]): number {
  let salary = 118_000
  for (const [i, aprilIdx] of aprilIndices.entries()) {
    if (m >= aprilIdx) {
      // Third April carries the promotion (18%); others are appraisals.
      salary *= i === 2 ? 1.18 : 1.095
    }
  }
  return Math.round(salary)
}

/**
 * Price-level multiplier per month, compounding India CPI (~5.1%, 4.3%,
 * 3.6% for FY23-FY26 per the Cost Inflation Index progression 331->348->
 * 363->376). Approximated as a smooth 4.4%/yr curve over the horizon.
 */
export function inflationForMonth(m: number): number {
  return Math.pow(1.044, m / 12)
}
