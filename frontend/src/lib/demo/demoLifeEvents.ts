import { ACCOUNTS } from './demoTemplates'
import { formatDate, txId, type MonthCtx } from './demoTxHelpers'

/**
 * Sparse, memorable life events layered over the monthly baseline. These give
 * the anomaly detector genuine outliers to find, the year-in-review page real
 * highlights, and the annual views visible texture:
 *
 * - one big vacation per year (Dec/Jan or May), flights + hotels + spending
 * - an annual health-insurance premium (fixed month, recurring-detectable)
 * - a laptop/phone-scale gadget purchase roughly once a year
 * - a one-off medical event (hospital + tests) once over the horizon
 * - a wedding-gift cluster in one wedding season
 * - a 12-month consumer-durable EMI stream (bill calendar / commitments)
 */
export function generateLifeEvents(ctx: MonthCtx): void {
  const { rng, txs, year, month, m } = ctx

  // Annual vacation: every 12 months at month index 11, 23, 35, 47 offsets
  // land on different calendar months depending on "now", so anchor on the
  // relative index instead -- one trip per 12-month block, in its 10th month.
  if (m % 12 === 9) {
    const scale = ctx.inflation
    txs.push(
      {
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, rng.int(2, 6))),
        amount: Math.round(rng.int(9000, 16000) * scale),
        type: 'Expense',
        category: 'Transportation',
        subcategory: 'InterCity Travel',
        account: ACCOUNTS.hdfc,
        note: rng.pick(['Flight - Goa Trip', 'Flight - Kerala Trip', 'Flight - Himachal Trip']),
        currency: 'INR',
      },
      {
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, rng.int(7, 10))),
        amount: Math.round(rng.int(12000, 22000) * scale),
        type: 'Expense',
        category: 'Entertainment & Recreations',
        subcategory: 'Vacation',
        account: ACCOUNTS.axisCC,
        note: rng.pick(['Resort Booking', 'Hotel - MakeMyTrip', 'Airbnb Stay']),
        currency: 'INR',
      },
      {
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, rng.int(8, 12))),
        amount: Math.round(rng.int(5000, 12000) * scale),
        type: 'Expense',
        category: 'Entertainment & Recreations',
        subcategory: 'Vacation',
        account: ACCOUNTS.gpay,
        note: rng.pick(['Trip Food & Local Travel', 'Scuba + Water Sports', 'Sightseeing & Cabs']),
        currency: 'INR',
      },
    )
  }

  // Annual health insurance premium -- fixed month (July), fixed-ish amount.
  // A textbook yearly recurring stream for the recurring detector.
  if (month === 6) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 12)),
      amount: Math.round((18_000 * ctx.inflation) / 100) * 100,
      type: 'Expense',
      category: 'Healthcare',
      subcategory: 'Insurance',
      account: ACCOUNTS.hdfc,
      note: 'Health Insurance Annual Premium',
      currency: 'INR',
    })
  }

  // Term life insurance premium -- fixed month (February).
  if (month === 1) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 8)),
      amount: 12_500,
      type: 'Expense',
      category: 'Miscellaneous',
      subcategory: 'Insurance',
      account: ACCOUNTS.hdfc,
      note: 'Term Life Insurance Premium',
      currency: 'INR',
    })
  }

  // One gadget splurge per 12-month block (its 4th month): a true
  // large-transaction anomaly against the Devices baseline.
  if (m % 12 === 3) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(10, 25))),
      amount: Math.round(rng.int(55_000, 95_000) * ctx.inflation),
      type: 'Expense',
      category: 'Gadgets & Accessories',
      subcategory: 'Devices',
      account: ACCOUNTS.amazonCC,
      note: rng.pick(['MacBook Air', 'iPhone Upgrade', 'OLED TV', 'Gaming Laptop']),
      currency: 'INR',
    })
  }

  // One-off medical event in month 30: hospital + labs + pharmacy cluster.
  if (m === 30) {
    txs.push(
      {
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, 14)),
        amount: 42_000,
        type: 'Expense',
        category: 'Healthcare',
        subcategory: 'Doctor Visits',
        account: ACCOUNTS.hdfc,
        note: 'Hospital - Minor Procedure',
        currency: 'INR',
      },
      {
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, 15)),
        amount: 6_500,
        type: 'Expense',
        category: 'Healthcare',
        subcategory: 'Doctor Visits',
        account: ACCOUNTS.gpay,
        note: 'Lab Tests - Full Panel',
        currency: 'INR',
      },
      {
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, 18)),
        amount: 3_800,
        type: 'Expense',
        category: 'Healthcare',
        subcategory: 'Medicines & Supplements',
        account: ACCOUNTS.amazonCC,
        note: 'Post-procedure Medicines',
        currency: 'INR',
      },
    )
  }

  // Wedding season cluster (months 26-28): gifts + outfit + travel.
  if (m >= 26 && m <= 28) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(5, 25))),
      amount: rng.int(5_000, 15_000),
      type: 'Expense',
      category: 'Miscellaneous',
      subcategory: 'Gifts',
      account: ACCOUNTS.hdfc,
      note: rng.pick(['Wedding Gift - College Friend', 'Wedding Gift - Cousin', 'Shagun Envelope']),
      currency: 'INR',
    })
  }

  // 12-month zero-cost EMI on a fridge/AC, months 18-29: a fixed monthly
  // debit for the bill calendar, commitments, and recurring detection.
  if (m >= 18 && m < 30) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 7)),
      amount: 4_250,
      type: 'Expense',
      category: 'EMI',
      subcategory: 'Consumer Durable EMI',
      account: ACCOUNTS.hdfc,
      note: 'AC EMI 12mo (No-Cost)',
      currency: 'INR',
    })
  }
}
