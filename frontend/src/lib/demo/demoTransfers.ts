import { ACCOUNTS } from './demoTemplates'
import { formatDate, txId, type MonthCtx } from './demoTxHelpers'

export function generateMonthlyTransfers(ctx: MonthCtx, salary: number): void {
  const { rng, txs, year, month, daysInMonth } = ctx

  txs.push(
    {
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 2)),
      amount: rng.int(50000, 70000),
      type: 'Transfer',
      category: 'Transfer',
      subcategory: 'Bank Transfer',
      account: ACCOUNTS.hdfc,
      from_account: ACCOUNTS.hdfc,
      to_account: ACCOUNTS.sbi,
      note: 'HDFC to SBI Monthly Sweep',
      is_transfer: true,
      currency: 'INR',
    },
    {
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 10)),
      amount: rng.pick([10000, 15000, 20000, 25000]),
      type: 'Transfer',
      category: 'Investment',
      subcategory: 'SIP',
      account: ACCOUNTS.sbi,
      from_account: ACCOUNTS.sbi,
      to_account: ACCOUNTS.growMF,
      note: rng.pick([
        'SIP - Axis Bluechip Fund',
        'SIP - Parag Parikh Flexi Cap',
        'SIP - Nifty 50 Index',
      ]),
      is_transfer: true,
      currency: 'INR',
    },
  )

  const stockTxCount = rng.int(0, 2)
  for (let s = 0; s < stockTxCount; s++) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
      amount: rng.int(2000, 15000),
      type: 'Transfer',
      category: 'Investment',
      subcategory: 'Stocks',
      account: ACCOUNTS.sbi,
      from_account: ACCOUNTS.sbi,
      to_account: ACCOUNTS.growStocks,
      note: rng.pick([
        'NIFTY Bees',
        'HDFC Bank Shares',
        'Reliance Stock',
        'TCS Stock',
        'Infosys Stock',
      ]),
      is_transfer: true,
      currency: 'INR',
    })
  }

  txs.push({
    id: txId(ctx.idx++),
    date: formatDate(new Date(year, month, 1)),
    amount: Math.round(salary * 0.12),
    type: 'Transfer',
    category: 'Investment',
    subcategory: 'EPF',
    account: ACCOUNTS.hdfc,
    from_account: ACCOUNTS.hdfc,
    to_account: ACCOUNTS.epf,
    note: 'EPF Contribution (Employee)',
    is_transfer: true,
    currency: 'INR',
  })

  if (month % 3 === 0) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 15)),
      amount: rng.pick([5000, 10000, 12500]),
      type: 'Transfer',
      category: 'Investment',
      subcategory: 'PPF',
      account: ACCOUNTS.sbi,
      from_account: ACCOUNTS.sbi,
      to_account: ACCOUNTS.ppf,
      note: 'PPF Contribution',
      is_transfer: true,
      currency: 'INR',
    })
  }

  if (month % 4 === 2 && rng.next() < 0.5) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(20, 28))),
      amount: rng.int(15000, 40000),
      type: 'Transfer',
      category: 'Investment',
      subcategory: 'Fixed Deposit',
      account: ACCOUNTS.sbi,
      from_account: ACCOUNTS.sbi,
      to_account: ACCOUNTS.fd,
      note: 'FD Booking',
      is_transfer: true,
      currency: 'INR',
    })
  }

  if (rng.next() < 0.25) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(5, 25))),
      amount: rng.int(5000, 80000),
      type: 'Transfer',
      category: 'Investment',
      subcategory: 'Stock Sale',
      account: ACCOUNTS.growStocks,
      from_account: ACCOUNTS.growStocks,
      to_account: ACCOUNTS.sbi,
      note: rng.pick(['Stock Sale - Withdrawal', 'Portfolio Rebalance', 'Profit Booking']),
      is_transfer: true,
      currency: 'INR',
    })
  }

  const walletTopups = rng.int(2, 3)
  for (let w = 0; w < walletTopups; w++) {
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
      amount: rng.pick([500, 1000, 1500, 2000]),
      type: 'Transfer',
      category: 'Transfer',
      subcategory: 'Wallet Top-up',
      account: ACCOUNTS.sbi,
      from_account: ACCOUNTS.sbi,
      to_account: ACCOUNTS.gpay,
      note: 'GPay UPI Top-up',
      is_transfer: true,
      currency: 'INR',
    })
  }

  txs.push({
    id: txId(ctx.idx++),
    date: formatDate(new Date(year, month, 3)),
    amount: 2200,
    type: 'Transfer',
    category: 'Transfer',
    subcategory: 'Meal Card',
    account: ACCOUNTS.hdfc,
    from_account: ACCOUNTS.hdfc,
    to_account: ACCOUNTS.pluxee,
    note: 'Pluxee Meal Card Top-up',
    is_transfer: true,
    currency: 'INR',
  })

  const friendsCount = rng.int(1, 3)
  for (let f = 0; f < friendsCount; f++) {
    const toFriends = rng.next() < 0.5
    const friendAmt = rng.int(200, 5000)
    txs.push({
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
      amount: friendAmt,
      type: 'Transfer',
      category: 'Transfer',
      subcategory: 'Settlement',
      account: toFriends ? ACCOUNTS.sbi : ACCOUNTS.friends,
      from_account: toFriends ? ACCOUNTS.sbi : ACCOUNTS.friends,
      to_account: toFriends ? ACCOUNTS.friends : ACCOUNTS.sbi,
      note: rng.pick([
        'Splitwise Settlement',
        'Dinner Split',
        'Cab Share',
        'Trip Settlement',
        'Food Split',
      ]),
      is_transfer: true,
      currency: 'INR',
    })
  }

  txs.push(
    {
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, rng.int(5, 10))),
      amount: rng.int(1000, 4000),
      type: 'Transfer',
      category: 'Transfer',
      subcategory: 'Shared Expenses',
      account: ACCOUNTS.gpay,
      from_account: ACCOUNTS.gpay,
      to_account: ACCOUNTS.flat,
      note: rng.pick([
        'Flat Groceries Share',
        'Flat Utilities Share',
        'Flat Maintenance Share',
      ]),
      is_transfer: true,
      currency: 'INR',
    },
    {
      id: txId(ctx.idx++),
      date: formatDate(new Date(year, month, 5)),
      amount: rng.int(10000, 20000),
      type: 'Transfer',
      category: 'Transfer',
      subcategory: 'Family Transfer',
      account: ACCOUNTS.hdfc,
      from_account: ACCOUNTS.hdfc,
      to_account: ACCOUNTS.family,
      note: 'Monthly Family Transfer',
      is_transfer: true,
      currency: 'INR',
    },
  )

  generateCCBillPayments(ctx)
}

function generateCCBillPayments(ctx: MonthCtx): void {
  const { txs, year, month } = ctx
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`
  const ccAccounts = [ACCOUNTS.swiggyCC, ACCOUNTS.amazonCC, ACCOUNTS.axisCC]

  for (const cc of ccAccounts) {
    const monthlyOnCC = txs.filter((t) => t.account === cc && t.date.startsWith(monthPrefix))
    const ccExpenses = monthlyOnCC
      .filter((t) => t.type === 'Expense')
      .reduce((s, t) => s + t.amount, 0)
    const ccRefunds = monthlyOnCC
      .filter((t) => t.type === 'Income')
      .reduce((s, t) => s + t.amount, 0)
    const ccBillAmount = ccExpenses - ccRefunds

    if (ccBillAmount > 0) {
      txs.push({
        id: txId(ctx.idx++),
        date: formatDate(new Date(year, month, 25)),
        amount: ccBillAmount,
        type: 'Transfer',
        category: 'Transfer',
        subcategory: 'Credit Card Payment',
        account: ACCOUNTS.hdfc,
        from_account: ACCOUNTS.hdfc,
        to_account: cc,
        note: `${cc} Bill Payment`,
        is_transfer: true,
        currency: 'INR',
      })
    }
  }
}
