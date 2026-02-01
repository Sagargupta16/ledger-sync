/**
 * Account type classification keywords and utilities
 */

// Keywords for identifying investment accounts
export const INVESTMENT_KEYWORDS = [
  'invest',
  'mutual',
  'stock',
  'equity',
  'sip',
  'portfolio',
  'fund',
  'demat',
  'brokerage',
  'share',
  'zerodha',
  'groww',
  'upstox',
  'mf',
  'nps',
  'ppf',
] as const

// Keywords for identifying deposit/savings accounts
export const DEPOSIT_KEYWORDS = [
  'saving',
  'current',
  'deposit',
  'bank',
  'account',
  'cash',
  'wallet',
  'checking',
  'fd',
  'fixed',
  'rd',
  'recurring',
] as const

// Keywords for identifying loan accounts
export const LOAN_KEYWORDS = [
  'loan',
  'credit',
  'mortgage',
  'emi',
  'debt',
  'borrowed',
  'lending',
  'home loan',
  'car loan',
  'personal loan',
] as const

/**
 * Check if account name matches any keywords
 */
export const matchesKeywords = (accountName: string, keywords: readonly string[]): boolean => {
  const lower = accountName.toLowerCase()
  return keywords.some((keyword) => lower.includes(keyword))
}

/**
 * Determine account type from name using keyword heuristics
 */
export const inferAccountType = (accountName: string): 'investment' | 'deposit' | 'loan' | null => {
  if (matchesKeywords(accountName, INVESTMENT_KEYWORDS)) return 'investment'
  if (matchesKeywords(accountName, LOAN_KEYWORDS)) return 'loan'
  if (matchesKeywords(accountName, DEPOSIT_KEYWORDS)) return 'deposit'
  return null
}
