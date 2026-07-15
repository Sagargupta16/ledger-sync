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

type Template = (typeof EXPENSE_TEMPLATES)[number]

/** Amount for one occurrence: rent is stepwise per lease; the rest ride CPI. */
function amountFor(ctx: MonthCtx, tmpl: Template): number {
  if (tmpl.subcategory === 'Rent') return rentForMonth(ctx.m)
  const festivalBoost =
    ctx.festival && FESTIVAL_SPIKE_SUBCATS.has(tmpl.subcategory) ? 1.35 : 1
  return Math.round(ctx.rng.int(tmpl.min, tmpl.max) * ctx.inflation * festivalBoost)
}

function pushExpense(ctx: MonthCtx, tmpl: Template, day: number): void {
  const notes = NOTES_MAP[tmpl.subcategory]
  ctx.txs.push({
    id: txId(ctx.idx++),
    date: formatDate(new Date(ctx.year, ctx.month, day)),
    amount: amountFor(ctx, tmpl),
    type: 'Expense',
    category: tmpl.category,
    subcategory: tmpl.subcategory,
    account: tmpl.account,
    note: notes ? ctx.rng.pick(notes) : tmpl.subcategory,
    currency: 'INR',
    tags: tagsFor(ctx, tmpl.subcategory),
  })
}

export function generateMonthlyExpenses(ctx: MonthCtx): void {
  const { rng, daysInMonth } = ctx

  for (const tmpl of EXPENSE_TEMPLATES) {
    if (tmpl.day !== undefined) {
      pushExpense(ctx, tmpl, Math.min(tmpl.day, daysInMonth))
    } else if (tmpl.freq !== undefined) {
      // Festival months also see slightly MORE purchases, not just larger ones.
      const freqBoost = ctx.festival && FESTIVAL_SPIKE_SUBCATS.has(tmpl.subcategory) ? 1.3 : 1
      const count = Math.round(tmpl.freq * freqBoost + (rng.next() - 0.5) * tmpl.freq * 0.6)
      for (let j = 0; j < Math.max(0, count); j++) {
        pushExpense(ctx, tmpl, rng.int(1, daysInMonth))
      }
    }
  }
}
