import { ACCOUNTS } from './demoTemplates'
import { formatDate, txId, type MonthCtx } from './demoTxHelpers'

export function generateMonthlyIncome(ctx: MonthCtx): { salary: number } {
  const { rng, txs, year, month, m } = ctx

  // Salary follows the April-appraisal growth curve (see salaryForMonth);
  // small jitter models variable deductions month to month.
  const salary = ctx.salaryMonthly + rng.int(-2000, 2000)
  txs.push(
    {
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 1)),
      amount: salary,
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'Salary',
      account: ACCOUNTS.hdfc,
      note: 'Monthly Salary Credit',
      currency: 'INR',
    },
    {
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 1)),
      amount: Math.round(salary * 0.024),
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'EPF Contribution',
      account: ACCOUNTS.epf,
      note: 'Employer EPF Contribution',
      currency: 'INR',
    },
  )

  // Annual performance bonus lands with the April appraisal (~1 month of
  // salary); Diwali month carries a small festival bonus; occasional spot
  // bonuses in other quarters.
  if (month === 3) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(25, 28))),
      amount: Math.round(ctx.salaryMonthly * (0.8 + rng.next() * 0.5)),
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'Bonuses',
      account: ACCOUNTS.hdfc,
      note: 'Annual Performance Bonus',
      currency: 'INR',
    })
  } else if (ctx.festival && month === 9) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(15, 25))),
      amount: rng.int(8000, 20000),
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'Bonuses',
      account: ACCOUNTS.hdfc,
      note: 'Festival Bonus',
      currency: 'INR',
    })
  } else if (m % 3 === 0 && rng.next() < 0.3) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(15, 28))),
      amount: rng.int(5000, 25000),
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'Bonuses',
      account: ACCOUNTS.hdfc,
      note: rng.pick(['Spot Bonus', 'Quarterly Incentive', 'Patent Award']),
      currency: 'INR',
    })
  }

  if (rng.next() < 0.2) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(10, 25))),
      amount: rng.int(500, 5000),
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'Expense Reimbursement',
      account: ACCOUNTS.hdfc,
      note: rng.pick([
        'WiFi Bill Reimbursement',
        'Team Lunch Reimbursement',
        'Travel Reimbursement',
      ]),
      currency: 'INR',
    })
  }

  if (month % 3 === 0) {
    // Interest grows with the corpus: roughly proportional to months elapsed.
    const corpusFactor = 1 + (m / 48) * 3
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(15, 28))),
      amount: Math.round(rng.int(400, 1500) * corpusFactor),
      type: 'Income',
      category: 'Investment Income',
      subcategory: 'Interest',
      account: ACCOUNTS.sbi,
      note: rng.pick(['Savings Interest', 'FD Interest Credit', 'RD Interest']),
      currency: 'INR',
    })
  }

  if (month % 6 === 2) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(10, 25))),
      amount: rng.int(200, 2000),
      type: 'Income',
      category: 'Investment Income',
      subcategory: 'Dividends',
      account: ACCOUNTS.growStocks,
      note: 'Dividend Credit',
      currency: 'INR',
    })
  }

  if (rng.next() < 0.15) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(5, 25))),
      amount: rng.int(1000, 20000),
      type: 'Income',
      category: 'Investment Income',
      subcategory: 'Stock Market Profit',
      account: ACCOUNTS.growStocks,
      note: rng.pick(['NIFTY Bees Sold', 'Stock Sale Profit', 'Intraday Profit']),
      currency: 'INR',
    })
  }

  generateMonthlyCashbacksAndRefunds(ctx)

  return { salary }
}

function generateMonthlyCashbacksAndRefunds(ctx: MonthCtx): void {
  const { rng, txs, year, month, daysInMonth } = ctx

  const cashbackCount = rng.int(2, 4)
  for (let c = 0; c < cashbackCount; c++) {
    const isCCCashback = rng.next() < 0.3
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
      amount: isCCCashback ? rng.int(100, 2000) : rng.int(5, 100),
      type: 'Income',
      category: 'Refund & Cashbacks',
      subcategory: isCCCashback ? 'Credit Card Cashbacks' : 'Other Cashbacks',
      account: isCCCashback
        ? ACCOUNTS.cashbackPool
        : rng.pick([ACCOUNTS.gpay, ACCOUNTS.amazonWallet]),
      note: isCCCashback
        ? rng.pick(['Swiggy CC Cashback', 'Amazon CC Cashback', 'CRED Cashback'])
        : rng.pick(['GPay Reward', 'Paytm Cashback', 'PhonePe Reward', 'Amazon Pay Cashback']),
      currency: 'INR',
    })
  }

  if (rng.next() < 0.25) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
      amount: rng.int(100, 2000),
      type: 'Income',
      category: 'Refund & Cashbacks',
      subcategory: 'Product Refunds',
      account: rng.pick([ACCOUNTS.amazonCC, ACCOUNTS.swiggyCC]),
      note: rng.pick([
        'Amazon Return Refund',
        'Swiggy Refund',
        'Order Cancelled',
        'Flipkart Refund',
      ]),
      currency: 'INR',
    })
  }

  // Occasional family gifts, more likely in festival months (shagun).
  if ((ctx.festival && rng.next() < 0.5) || rng.next() < 0.08) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(1, 15))),
      amount: rng.int(1000, 5000),
      type: 'Income',
      category: 'Other Income',
      subcategory: 'Gifts',
      account: ACCOUNTS.sbi,
      note: rng.pick(['Birthday Gift', 'Festival Shagun', 'Family Gift']),
      currency: 'INR',
    })
  }
}
