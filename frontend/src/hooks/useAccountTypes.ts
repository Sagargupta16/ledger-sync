import { useAccountStore } from '@/store/accountStore'

/**
 * Hook to determine if an account should be treated as an investment account
 * Priority: User-defined classification > Keyword-based heuristic
 */
export const useIsInvestmentAccount = (accountName: string): boolean => {
  const { isAccountType } = useAccountStore()
  const userClassified = isAccountType(accountName, 'investment')

  // If user has classified, use that
  if (userClassified !== undefined) {
    return userClassified
  }

  // Fallback to keyword-based heuristic
  const INVESTMENT_KEYWORDS = [
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
  ]
  const lower = accountName.toLowerCase()
  return INVESTMENT_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/**
 * Hook to determine if an account is a deposit account
 */
export const useIsDepositAccount = (accountName: string): boolean => {
  const { isAccountType } = useAccountStore()
  const userClassified = isAccountType(accountName, 'deposit')

  if (userClassified !== undefined) {
    return userClassified
  }

  // Fallback heuristic
  const DEPOSIT_KEYWORDS = ['saving', 'current', 'deposit', 'bank', 'account', 'cash', 'wallet']
  const lower = accountName.toLowerCase()
  return DEPOSIT_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/**
 * Hook to determine if an account is a loan account
 */
export const useIsLoanAccount = (accountName: string): boolean => {
  const { isAccountType } = useAccountStore()
  const userClassified = isAccountType(accountName, 'loan')

  if (userClassified !== undefined) {
    return userClassified
  }

  // Fallback heuristic
  const LOAN_KEYWORDS = ['loan', 'credit', 'emi', 'debt', 'mortgage', 'liability']
  const lower = accountName.toLowerCase()
  return LOAN_KEYWORDS.some((keyword) => lower.includes(keyword))
}

/**
 * Hook to filter investment accounts from account data
 */
export const useFilterInvestmentAccounts = (accounts: Record<string, unknown>) => {
  const { isAccountType } = useAccountStore()
  
  const INVESTMENT_KEYWORDS = [
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
  ]
  
  return Object.keys(accounts).filter((accountName) => {
    const userClassified = isAccountType(accountName, 'investment')
    
    if (userClassified !== undefined) {
      return userClassified
    }
    
    // Fallback heuristic
    const lower = accountName.toLowerCase()
    return INVESTMENT_KEYWORDS.some((keyword) => lower.includes(keyword))
  })
}
