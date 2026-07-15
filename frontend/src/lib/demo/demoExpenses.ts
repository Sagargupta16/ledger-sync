import { EXPENSE_TEMPLATES, NOTES_MAP } from './demoTemplates'
import { formatDate, txId, type MonthCtx } from './demoTxHelpers'

/** Categories whose spend spikes in the Oct/Nov festival season. */
const FESTIVAL_SPIKE_SUBCATS = new Set([
  'Clothing',
  'Gifts',
  'Groceries',
  'Dining Out',
  'Household Items',
  'Devices',
])

/**
 * Rent follows the Indian 11-month lease cycle: flat within a lease, then a
 * step increase (~8%, typical metro escalation) at renewal. Base ₹15k.
 */
function rentForMonth(m: number): number {
  const leaseIndex = Math.floor(m / 11)
  return Math.round((15_000 * Math.pow(1.08, leaseIndex)) / 500) * 500
}

/**
 * Sparse user tags so the tag filter/facets have real data: festival buys
 * get #festival, weekend dining gets #weekend-treat, work lunches #office.
 */
function tagsFor(ctx: MonthCtx, subcategory: string): string[] | undefined {
  if (ctx.festival && FESTIVAL_SPIKE_SUBCATS.has(subcategory)) return ['festival']
  if (subcategory === 'Dining Out' && ctx.rng.next() < 0.5) return ['weekend-treat']
  if (subcategory === 'Office Cafeteria' && ctx.rng.next() < 0.2) return ['office']
  return undefined
}

export function generateMonthlyExpenses(ctx: MonthCtx): void {
  const { rng, txs, year, month, daysInMonth } = ctx

  for (const tmpl of EXPENSE_TEMPLATES) {
    // Variable spending rides the CPI curve; rent is stepwise per lease.
    const isRent = tmpl.subcategory === 'Rent'
    const festivalBoost =
      ctx.festival && FESTIVAL_SPIKE_SUBCATS.has(tmpl.subcategory) ? 1.35 : 1

    const scaledAmount = (): number => {
      if (isRent) return rentForMonth(ctx.m)
      return Math.round(rng.int(tmpl.min, tmpl.max) * ctx.inflation * festivalBoost)
    }

    if (tmpl.day !== undefined) {
      const day = Math.min(tmpl.day, daysInMonth)
      const notes = NOTES_MAP[tmpl.subcategory]
      txs.push({
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, day)),
        amount: scaledAmount(),
        type: 'Expense',
        category: tmpl.category,
        subcategory: tmpl.subcategory,
        account: tmpl.account,
        note: notes ? rng.pick(notes) : tmpl.subcategory,
        currency: 'INR',
        tags: tagsFor(ctx, tmpl.subcategory),
      })
    } else if (tmpl.freq !== undefined) {
      // Festival months also see slightly MORE purchases, not just larger ones.
      const freqBoost = ctx.festival && FESTIVAL_SPIKE_SUBCATS.has(tmpl.subcategory) ? 1.3 : 1
      const count = Math.round(
        tmpl.freq * freqBoost + (rng.next() - 0.5) * tmpl.freq * 0.6,
      )
      for (let j = 0; j < Math.max(0, count); j++) {
        const notes = NOTES_MAP[tmpl.subcategory]
        txs.push({
          id: txId(ctx.idx++),
          date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
          amount: scaledAmount(),
          type: 'Expense',
          category: tmpl.category,
          subcategory: tmpl.subcategory,
          account: tmpl.account,
          note: notes ? rng.pick(notes) : tmpl.subcategory,
          currency: 'INR',
          tags: tagsFor(ctx, tmpl.subcategory),
        })
      }
    }
  }
}
