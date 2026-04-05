import type { Transaction } from '@/types'

/** Simple seeded PRNG (LCG) for deterministic output */
function createRng(seed: number) {
  let s = seed
  return {
    /** Returns a float in [0, 1) */
    next(): number {
      s = (s * 1664525 + 1013904223) & 0xffffffff
      return (s >>> 0) / 0x100000000
    },
    /** Returns an integer in [min, max] inclusive */
    int(min: number, max: number): number {
      return Math.floor(this.next() * (max - min + 1)) + min
    },
    /** Pick a random element from an array */
    pick<T>(arr: readonly T[]): T {
      return arr[Math.floor(this.next() * arr.length)]
    },
  }
}

function formatDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function txId(index: number): string {
  return `demo-${String(index).padStart(5, '0')}`
}

// ---------------------------------------------------------------------------
// Accounts — inspired by a real Indian tech professional's setup
// ---------------------------------------------------------------------------

const ACCOUNTS = {
  // Banks
  sbi: 'SBI Savings',
  hdfc: 'HDFC Salary',
  axis: 'Axis Bank',
  // Credit cards
  swiggyCC: 'Swiggy HDFC Credit Card',
  amazonCC: 'Amazon Pay ICICI Credit Card',
  axisCC: 'Flipkart Axis Credit Card',
  // UPI / Wallets
  gpay: 'GPay UPI',
  pluxee: 'Pluxee Wallet',
  amazonWallet: 'Amazon Wallet',
  // Investments
  growStocks: 'Groww Stocks',
  growMF: 'Groww Mutual Funds',
  epf: 'EPF Account',
  ppf: 'PPF Account',
  fd: 'SBI FD',
  // Social / shared
  friends: 'Friends Account',
  flat: 'Flat Shared Account',
  family: 'Family Account',
  cashbackPool: 'Cashback Pool',
  // Other
  cash: 'Cash',
  voucher: 'Voucher Account',
} as const

// ---------------------------------------------------------------------------
// Expense templates — comprehensive coverage matching real patterns
// ---------------------------------------------------------------------------

interface ExpenseTemplate {
  category: string
  subcategory: string
  min: number
  max: number
  account: string
  freq?: number  // avg times per month (variable)
  day?: number   // fixed day of month
}

const EXPENSE_TEMPLATES: readonly ExpenseTemplate[] = [
  // Food & Dining (largest volume in real data)
  { category: 'Food & Dining', subcategory: 'Office Cafeteria', min: 40, max: 150, account: ACCOUNTS.pluxee, freq: 20 },
  { category: 'Food & Dining', subcategory: 'Delivery Apps', min: 100, max: 600, account: ACCOUNTS.swiggyCC, freq: 8 },
  { category: 'Food & Dining', subcategory: 'Dining Out', min: 300, max: 2500, account: ACCOUNTS.swiggyCC, freq: 2 },
  { category: 'Food & Dining', subcategory: 'Groceries', min: 200, max: 3500, account: ACCOUNTS.gpay, freq: 4 },
  { category: 'Food & Dining', subcategory: 'Snacks & Beverages', min: 20, max: 200, account: ACCOUNTS.gpay, freq: 6 },

  // Transportation (second largest)
  { category: 'Transportation', subcategory: 'Daily Commute', min: 25, max: 250, account: ACCOUNTS.gpay, freq: 18 },
  { category: 'Transportation', subcategory: 'InterCity Travel', min: 500, max: 8000, account: ACCOUNTS.hdfc, freq: 0.3 },

  // Housing
  { category: 'Housing', subcategory: 'Rent', min: 15000, max: 15000, account: ACCOUNTS.hdfc, day: 5 },
  { category: 'Housing', subcategory: 'Utilities', min: 800, max: 3000, account: ACCOUNTS.hdfc, freq: 2 },
  { category: 'Housing', subcategory: 'Household Items', min: 100, max: 2000, account: ACCOUNTS.amazonCC, freq: 1.5 },
  { category: 'Housing', subcategory: 'Domestic Help', min: 2000, max: 3000, account: ACCOUNTS.cash, day: 1 },
  { category: 'Housing', subcategory: 'Maintenance & Repairs', min: 500, max: 5000, account: ACCOUNTS.gpay, freq: 0.2 },

  // Entertainment & Recreations
  { category: 'Entertainment & Recreations', subcategory: 'Recharge', min: 179, max: 599, account: ACCOUNTS.gpay, freq: 1.5 },
  { category: 'Entertainment & Recreations', subcategory: 'OTT Subscriptions', min: 149, max: 649, account: ACCOUNTS.swiggyCC, day: 1 },
  { category: 'Entertainment & Recreations', subcategory: 'Movies & Events', min: 200, max: 1500, account: ACCOUNTS.axisCC, freq: 0.8 },
  { category: 'Entertainment & Recreations', subcategory: 'Parties & Treats', min: 300, max: 3000, account: ACCOUNTS.swiggyCC, freq: 0.8 },
  { category: 'Entertainment & Recreations', subcategory: 'Hobbies', min: 200, max: 2000, account: ACCOUNTS.amazonCC, freq: 0.3 },

  // Personal Care
  { category: 'Personal Care', subcategory: 'Clothing', min: 500, max: 5000, account: ACCOUNTS.axisCC, freq: 0.8 },
  { category: 'Personal Care', subcategory: 'Grooming Products', min: 100, max: 800, account: ACCOUNTS.amazonCC, freq: 0.5 },
  { category: 'Personal Care', subcategory: 'Haircut & Grooming', min: 200, max: 600, account: ACCOUNTS.gpay, freq: 0.5 },

  // Education
  { category: 'Education', subcategory: 'Books & Supplies', min: 200, max: 2000, account: ACCOUNTS.amazonCC, freq: 0.4 },
  { category: 'Education', subcategory: 'Courses & Workshops', min: 500, max: 10000, account: ACCOUNTS.hdfc, freq: 0.1 },
  { category: 'Education', subcategory: 'Exam Fees', min: 500, max: 5000, account: ACCOUNTS.hdfc, freq: 0.08 },

  // Healthcare
  { category: 'Healthcare', subcategory: 'Medicines & Supplements', min: 100, max: 2000, account: ACCOUNTS.amazonCC, freq: 0.3 },
  { category: 'Healthcare', subcategory: 'Doctor Visits', min: 500, max: 3000, account: ACCOUNTS.gpay, freq: 0.15 },

  // Gadgets & Accessories
  { category: 'Gadgets & Accessories', subcategory: 'Devices', min: 2000, max: 50000, account: ACCOUNTS.amazonCC, freq: 0.06 },
  { category: 'Gadgets & Accessories', subcategory: 'Accessories', min: 300, max: 5000, account: ACCOUNTS.axisCC, freq: 0.15 },

  // Family
  { category: 'Family', subcategory: 'Regular Support', min: 5000, max: 15000, account: ACCOUNTS.hdfc, freq: 0.5 },
  { category: 'Family', subcategory: 'Extra Expenses', min: 1000, max: 30000, account: ACCOUNTS.hdfc, freq: 0.3 },

  // Charity
  { category: 'Charity', subcategory: 'Donations', min: 100, max: 2000, account: ACCOUNTS.gpay, freq: 0.3 },
  { category: 'Charity', subcategory: 'Religious Offerings', min: 50, max: 500, account: ACCOUNTS.cash, freq: 0.2 },

  // Miscellaneous
  { category: 'Miscellaneous', subcategory: 'Unknown', min: 50, max: 2000, account: ACCOUNTS.sbi, freq: 2 },
  { category: 'Miscellaneous', subcategory: 'Software Subscriptions', min: 100, max: 1500, account: ACCOUNTS.swiggyCC, freq: 0.3 },
  { category: 'Miscellaneous', subcategory: 'Bank Fees', min: 50, max: 500, account: ACCOUNTS.sbi, freq: 0.2 },
  { category: 'Miscellaneous', subcategory: 'Gifts', min: 500, max: 5000, account: ACCOUNTS.amazonCC, freq: 0.3 },

  // Investment Charges & Loss
  { category: 'Investment Charges & Loss', subcategory: 'Brokerage Fees', min: 20, max: 500, account: ACCOUNTS.growStocks, freq: 0.3 },
] as const

// ---------------------------------------------------------------------------
// Notes — realistic, specific descriptions
// ---------------------------------------------------------------------------

const NOTES_MAP: Record<string, string[]> = {
  'Office Cafeteria': ['Sambhar Rice', 'Egg Biryani', 'Lunch', 'Papaya Bowl', 'Thali', 'Curd Rice', 'Dosa', 'Idli Plate', 'Poha', 'Coffee'],
  'Delivery Apps': ['Mattar Paneer Meal', 'Burger Combo', 'Pizzas + Pepsi', 'Chicken Biryani', 'Pasta Bowl', 'Wraps Combo', 'South Indian Thali', 'Chinese Combo'],
  'Dining Out': ['Dinner at Barbeque Nation', 'Lunch - Saravana Bhavan', 'Pizza Hut', 'Cafe Coffee Day', 'Team Lunch', 'Birthday Dinner', 'Weekend Brunch'],
  'Groceries': ['BigBasket Order', 'DMart', 'Zepto Order', 'Blinkit Groceries', 'Swiggy Instamart', 'Reliance Fresh'],
  'Snacks & Beverages': ['Coconut Water', 'Juice - Mango', 'Milk Shake - Banana', 'Chai', 'Cold Coffee', 'Ice Cream', 'Street Food'],
  'Daily Commute': ['Uber Bike Flat to Office', 'Uber Bike Office to Flat', 'Uber Auto Office to Flat', 'Rapido Bike', 'Metro Recharge'],
  'InterCity Travel': ['Train Ticket - Weekend Trip', 'Flight - Home Visit', 'Bus - Weekend Getaway', 'Redbus Booking'],
  'Rent': ['Monthly Rent'],
  'Utilities': ['Electricity Bill', 'WiFi Bill', 'Water Bill', 'Gas Cylinder', 'Cooking Gas'],
  'Household Items': ['Water Bottle', 'Surf Excel', 'Cleaning Supplies', 'Kitchen Items', 'Broom & Mop'],
  'Domestic Help': ['Maid Monthly', 'Cook Monthly'],
  'Recharge': ['Jio Recharge - Self', 'Jio Data Add-On', 'Airtel Recharge - Self'],
  'OTT Subscriptions': ['Netflix Subscription', 'Amazon Prime', 'Disney+ Hotstar', 'Spotify Premium', 'YouTube Premium'],
  'Movies & Events': ['PVR Cinemas', 'BookMyShow', 'Cricket Turf', 'Concert Tickets'],
  'Parties & Treats': ['Birthday Party', 'Team Dinner', 'Housewarming Treat', 'Farewell Party'],
  'Clothing': ['Myntra Order', 'Flipkart Fashion', 'Amazon Fashion', 'Zara', 'H&M'],
  'Grooming Products': ['Shampoo', 'Face Cream', 'Facewash', 'Body Wash', 'Sunscreen'],
  'Haircut & Grooming': ['Haircut & Face Massage', 'Haircut & Trim', 'Beard Trim'],
  'Books & Supplies': ['Amazon Books', 'Kindle Purchase', 'Tech Book', 'Stationery'],
  'Courses & Workshops': ['Udemy Course', 'AWS Certification Prep', 'Online Workshop'],
  'Medicines & Supplements': ['Apollo Pharmacy', '1mg Order', 'Protein Powder', 'Multivitamins'],
  'Doctor Visits': ['General Checkup', 'Lab Tests', 'Dental Checkup', 'Eye Checkup'],
  'Devices': ['Laptop Upgrade', 'Wireless Earbuds', 'Smart Watch', 'Keyboard'],
  'Accessories': ['Phone Case', 'USB Hub', 'Charger', 'Screen Protector', 'Mouse Pad'],
  'Regular Support': ['Monthly Family Support', 'Parents - Medical', 'Parents - Groceries'],
  'Extra Expenses': ['Festival Gift - Family', 'Emergency - Family', 'Home Repair - Parents'],
  'Donations': ['NGO Donation', 'Charity Event', 'Education Fund'],
  'Religious Offerings': ['Temple Donation', 'Festival Offering'],
  'Unknown': ['Miscellaneous', 'Cash Withdrawal', 'ATM', 'UPI Payment'],
  'Gifts': ['Birthday Gift', 'Wedding Gift', 'Festival Gift', 'Housewarming Gift'],
  'Brokerage Fees': ['Groww Brokerage', 'DP Charges', 'STT Charges'],
}

/**
 * Generate ~1000 realistic Indian tech professional transactions spanning 24 months.
 * Output is deterministic (same data every call).
 */
export function generateDemoTransactions(): Transaction[] {
  const rng = createRng(42)
  const txs: Transaction[] = []
  let idx = 0

  const now = new Date()
  // Start 24 months ago, on the 1st
  const startDate = new Date(now.getFullYear(), now.getMonth() - 23, 1)

  for (let m = 0; m < 24; m++) {
    const year = startDate.getFullYear() + Math.floor((startDate.getMonth() + m) / 12)
    const month = (startDate.getMonth() + m) % 12
    const daysInMonth = new Date(year, month + 1, 0).getDate()

    // ─── INCOME ──────────────────────────────────────────────────────

    // Salary (1st of month, with career growth)
    const baseSalary = 145000 + Math.floor(m / 6) * 8000
    const salary = baseSalary + rng.int(-3000, 3000)
    txs.push({
      id: txId(idx++),
      date: formatDate(new Date(year, month, 1)),
      amount: salary,
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'Salary',
      account: ACCOUNTS.hdfc,
      note: 'Monthly Salary Credit',
      currency: 'INR',
    })

    // EPF employer contribution (1st of month)
    const epfAmount = Math.round(salary * 0.024)
    txs.push({
      id: txId(idx++),
      date: formatDate(new Date(year, month, 1)),
      amount: epfAmount,
      type: 'Income',
      category: 'Employment Income',
      subcategory: 'EPF Contribution',
      account: ACCOUNTS.epf,
      note: 'Employer EPF Contribution',
      currency: 'INR',
    })

    // Bonuses (every 6 months + random)
    if (m % 6 === 5 || (m % 3 === 0 && rng.next() < 0.3)) {
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(15, 28))),
        amount: rng.int(5000, 25000),
        type: 'Income',
        category: 'Employment Income',
        subcategory: 'Bonuses',
        account: ACCOUNTS.hdfc,
        note: rng.pick(['Performance Bonus', 'Spot Bonus', 'Quarterly Incentive', 'Festival Bonus']),
        currency: 'INR',
      })
    }

    // Expense reimbursements (occasional)
    if (rng.next() < 0.2) {
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(10, 25))),
        amount: rng.int(500, 5000),
        type: 'Income',
        category: 'Employment Income',
        subcategory: 'Expense Reimbursement',
        account: ACCOUNTS.hdfc,
        note: rng.pick(['WiFi Bill Reimbursement', 'Team Lunch Reimbursement', 'Travel Reimbursement']),
        currency: 'INR',
      })
    }

    // Interest income (quarterly)
    if (month % 3 === 0) {
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(15, 28))),
        amount: rng.int(200, 3000),
        type: 'Income',
        category: 'Investment Income',
        subcategory: 'Interest',
        account: ACCOUNTS.sbi,
        note: rng.pick(['Savings Interest', 'FD Interest Credit', 'RD Interest']),
        currency: 'INR',
      })
    }

    // Dividends (2x per year)
    if (month % 6 === 2) {
      txs.push({
        id: txId(idx++),
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

    // Stock market profits (occasional)
    if (rng.next() < 0.15) {
      txs.push({
        id: txId(idx++),
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

    // Cashbacks (2-4 per month, small amounts)
    const cashbackCount = rng.int(2, 4)
    for (let c = 0; c < cashbackCount; c++) {
      const isCCCashback = rng.next() < 0.3
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
        amount: isCCCashback ? rng.int(100, 2000) : rng.int(5, 100),
        type: 'Income',
        category: 'Refund & Cashbacks',
        subcategory: isCCCashback ? 'Credit Card Cashbacks' : 'Other Cashbacks',
        account: isCCCashback ? ACCOUNTS.cashbackPool : rng.pick([ACCOUNTS.gpay, ACCOUNTS.amazonWallet]),
        note: isCCCashback
          ? rng.pick(['Swiggy CC Cashback', 'Amazon CC Cashback', 'CRED Cashback'])
          : rng.pick(['GPay Reward', 'Paytm Cashback', 'PhonePe Reward', 'Amazon Pay Cashback']),
        currency: 'INR',
      })
    }

    // Refunds (occasional)
    if (rng.next() < 0.25) {
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
        amount: rng.int(100, 2000),
        type: 'Income',
        category: 'Refund & Cashbacks',
        subcategory: 'Product Refunds',
        account: rng.pick([ACCOUNTS.amazonCC, ACCOUNTS.swiggyCC]),
        note: rng.pick(['Amazon Return Refund', 'Swiggy Refund', 'Order Cancelled', 'Flipkart Refund']),
        currency: 'INR',
      })
    }

    // Pocket money / gifts (early months only — simulating earlier career)
    if (m < 6 && rng.next() < 0.4) {
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(1, 15))),
        amount: rng.int(1000, 5000),
        type: 'Income',
        category: 'Other Income',
        subcategory: 'Gifts',
        account: ACCOUNTS.sbi,
        note: rng.pick(['Birthday Gift', 'Festival Gift', 'Family Gift']),
        currency: 'INR',
      })
    }

    // ─── EXPENSES ──────────────────────────────────────────────────────

    for (const tmpl of EXPENSE_TEMPLATES) {
      if (tmpl.day !== undefined) {
        // Fixed monthly expense on a specific day
        const day = Math.min(tmpl.day, daysInMonth)
        const amount = rng.int(tmpl.min, tmpl.max)
        const notes = NOTES_MAP[tmpl.subcategory]
        txs.push({
          id: txId(idx++),
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
        // Variable frequency expense
        const count = Math.round(tmpl.freq + (rng.next() - 0.5) * tmpl.freq * 0.6)
        for (let j = 0; j < Math.max(0, count); j++) {
          const amount = rng.int(tmpl.min, tmpl.max)
          const notes = NOTES_MAP[tmpl.subcategory]
          txs.push({
            id: txId(idx++),
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

    // ─── TRANSFERS ──────────────────────────────────────────────────────

    // Salary account -> savings (monthly sweep)
    txs.push({
      id: txId(idx++),
      date: formatDate(new Date(year, month, 2)),
      amount: rng.int(30000, 60000),
      type: 'Transfer',
      category: 'Transfer',
      subcategory: 'Bank Transfer',
      account: ACCOUNTS.hdfc,
      from_account: ACCOUNTS.hdfc,
      to_account: ACCOUNTS.sbi,
      note: 'HDFC to SBI Monthly Sweep',
      is_transfer: true,
      currency: 'INR',
    })

    // SIP to mutual funds (10th)
    txs.push({
      id: txId(idx++),
      date: formatDate(new Date(year, month, 10)),
      amount: rng.pick([10000, 15000, 20000, 25000]),
      type: 'Transfer',
      category: 'Investment',
      subcategory: 'SIP',
      account: ACCOUNTS.sbi,
      from_account: ACCOUNTS.sbi,
      to_account: ACCOUNTS.growMF,
      note: rng.pick(['SIP - Axis Bluechip Fund', 'SIP - Parag Parikh Flexi Cap', 'SIP - Nifty 50 Index']),
      is_transfer: true,
      currency: 'INR',
    })

    // Stock investments (1-3 per month)
    const stockTxCount = rng.int(1, 3)
    for (let s = 0; s < stockTxCount; s++) {
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
        amount: rng.int(2000, 50000),
        type: 'Transfer',
        category: 'Investment',
        subcategory: 'Stocks',
        account: ACCOUNTS.sbi,
        from_account: rng.pick([ACCOUNTS.sbi, ACCOUNTS.hdfc]),
        to_account: ACCOUNTS.growStocks,
        note: rng.pick(['NIFTY Bees', 'HDFC Bank Shares', 'Reliance Stock', 'TCS Stock', 'Infosys Stock']),
        is_transfer: true,
        currency: 'INR',
      })
    }

    // EPF employee contribution (1st)
    txs.push({
      id: txId(idx++),
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

    // PPF (quarterly)
    if (month % 3 === 0) {
      txs.push({
        id: txId(idx++),
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

    // FD booking (every 4 months, optional)
    if (month % 4 === 2 && rng.next() < 0.5) {
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(20, 28))),
        amount: rng.int(25000, 100000),
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

    // Stock sale (return to bank, occasional)
    if (rng.next() < 0.25) {
      txs.push({
        id: txId(idx++),
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

    // UPI wallet top-up (2-3 per month)
    const walletTopups = rng.int(2, 3)
    for (let w = 0; w < walletTopups; w++) {
      txs.push({
        id: txId(idx++),
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

    // Pluxee meal card top-up (monthly)
    txs.push({
      id: txId(idx++),
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

    // Friends account settlements (1-3 per month)
    const friendsCount = rng.int(1, 3)
    for (let f = 0; f < friendsCount; f++) {
      const toFriends = rng.next() < 0.5
      const friendAmt = rng.int(200, 5000)
      txs.push({
        id: txId(idx++),
        date: formatDate(new Date(year, month, rng.int(1, daysInMonth))),
        amount: friendAmt,
        type: 'Transfer',
        category: 'Transfer',
        subcategory: 'Settlement',
        account: toFriends ? ACCOUNTS.sbi : ACCOUNTS.friends,
        from_account: toFriends ? ACCOUNTS.sbi : ACCOUNTS.friends,
        to_account: toFriends ? ACCOUNTS.friends : ACCOUNTS.sbi,
        note: rng.pick(['Splitwise Settlement', 'Dinner Split', 'Cab Share', 'Trip Settlement', 'Food Split']),
        is_transfer: true,
        currency: 'INR',
      })
    }

    // Flat shared expenses (monthly)
    txs.push({
      id: txId(idx++),
      date: formatDate(new Date(year, month, rng.int(5, 10))),
      amount: rng.int(1000, 4000),
      type: 'Transfer',
      category: 'Transfer',
      subcategory: 'Shared Expenses',
      account: ACCOUNTS.gpay,
      from_account: ACCOUNTS.gpay,
      to_account: ACCOUNTS.flat,
      note: rng.pick(['Flat Groceries Share', 'Flat Utilities Share', 'Flat Maintenance Share']),
      is_transfer: true,
      currency: 'INR',
    })

    // Family support transfer (monthly)
    txs.push({
      id: txId(idx++),
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
    })

    // Credit card bill payments (25th)
    const ccAccounts = [ACCOUNTS.swiggyCC, ACCOUNTS.amazonCC, ACCOUNTS.axisCC]
    for (const cc of ccAccounts) {
      const ccSpend = txs
        .filter(
          (t) =>
            t.account === cc &&
            t.type === 'Expense' &&
            t.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`),
        )
        .reduce((s, t) => s + t.amount, 0)

      if (ccSpend > 0) {
        txs.push({
          id: txId(idx++),
          date: formatDate(new Date(year, month, 25)),
          amount: ccSpend,
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

  // Sort by date descending (newest first, matching real API behavior)
  txs.sort((a, b) => b.date.localeCompare(a.date))

  return txs
}
