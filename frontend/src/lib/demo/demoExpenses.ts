import { EXPENSE_TEMPLATES, NOTES_MAP } from './demoTemplates'
import { formatDate, txId, type MonthCtx } from './demoTxHelpers'

export function generateMonthlyExpenses(ctx: MonthCtx): void {
  const { rng, txs, year, month, daysInMonth } = ctx

  for (const tmpl of EXPENSE_TEMPLATES) {
    if (tmpl.day !== undefined) {
      const day = Math.min(tmpl.day, daysInMonth)
      const amount = rng.int(tmpl.min, tmpl.max)
      const notes = NOTES_MAP[tmpl.subcategory]
      txs.push({
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, day)),
        amount,
        type: 'Expense',
        category: tmpl.category,
        subcategory: tmpl.subcategory,
        account: tmpl.account,
        note: notes ? rng.pick(notes) : tmpl.subcategory,
        currency: 'INR',
      })
    } else if (tmpl.freq !== undefined) {
      const count = Math.round(tmpl.freq + (rng.next() - 0.5) * tmpl.freq * 0.6)
      for (let j = 0; j < Math.max(0, count); j++) {
        const amount = rng.int(tmpl.min, tmpl.max)
        const notes = NOTES_MAP[tmpl.subcategory]
        txs.push({
          id: txId(ctx.idx++),
          date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
          amount,
          type: 'Expense',
          category: tmpl.category,
          subcategory: tmpl.subcategory,
          account: tmpl.account,
          note: notes ? rng.pick(notes) : tmpl.subcategory,
          currency: 'INR',
        })
      }
    }
  }
}
