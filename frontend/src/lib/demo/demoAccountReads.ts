import type { SavedView } from '@/services/api/savedViews'

/** Static account-classification and saved-view fixtures for demo mode. */

/** Account-name -> classification map (Settings > Accounts equivalents). */
export function generateDemoAccountClassifications(): Record<string, string> {
  return {
    'SBI Savings': 'Bank Accounts',
    'HDFC Salary': 'Bank Accounts',
    'Axis Bank': 'Bank Accounts',
    'Swiggy HDFC Credit Card': 'Credit Cards',
    'Amazon Pay ICICI Credit Card': 'Credit Cards',
    'Flipkart Axis Credit Card': 'Credit Cards',
    'GPay UPI': 'Other Wallets',
    'Pluxee Wallet': 'Other Wallets',
    'Amazon Wallet': 'Other Wallets',
    'Groww Stocks': 'Investments',
    'Groww Mutual Funds': 'Investments',
    'EPF Account': 'Investments',
    'PPF Account': 'Investments',
    'SBI FD': 'Investments',
    'Friends Account': 'Loans/Lended',
    'Flat Shared Account': 'Loans/Lended',
    'Family Account': 'Loans/Lended',
    'Cashback Pool': 'Other Wallets',
    Cash: 'Cash',
    'Voucher Account': 'Other Wallets',
  }
}

/**
 * Accounts of one classification, matching `/account-classifications/type/{type}`.
 *
 * Derived from the map above rather than listed separately so the two can never
 * disagree. Needed as its own demo route because the endpoint returns a bare
 * `{ accounts: [...] }`, not the name -> classification map: callers such as the
 * SIP projection page do `accounts.includes(name)` on it, which throws on
 * `undefined` and takes the whole page to its error boundary.
 */
export function generateDemoAccountsByType(accountType: string): { accounts: string[] } {
  const classifications = generateDemoAccountClassifications()
  return {
    accounts: Object.entries(classifications)
      .filter(([, type]) => type === accountType)
      .map(([name]) => name),
  }
}

export function generateDemoSavedViews(): SavedView[] {
  const now = new Date().toISOString()
  return [
    {
      id: 1,
      name: 'Festival Spending',
      filters: { tag: 'festival', type: 'Expense' },
      created_at: now,
      updated_at: now,
    },
    {
      id: 2,
      name: 'Big Expenses (5k+)',
      filters: { type: 'Expense', min_amount: 5000 },
      created_at: now,
      updated_at: now,
    },
    {
      id: 3,
      name: 'Food on Credit Cards',
      filters: { category: 'Food & Dining', account: 'Swiggy HDFC Credit Card' },
      created_at: now,
      updated_at: now,
    },
  ]
}
