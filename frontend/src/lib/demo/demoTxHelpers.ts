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
}
