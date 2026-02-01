import { useAccountStore } from '@/store/accountStore'
import { 
  INVESTMENT_KEYWORDS, 
  DEPOSIT_KEYWORDS, 
  LOAN_KEYWORDS, 
  matchesKeywords 
} from '@/constants/accountTypes'

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
  return matchesKeywords(accountName, INVESTMENT_KEYWORDS)
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
  return matchesKeywords(accountName, DEPOSIT_KEYWORDS)
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
  return matchesKeywords(accountName, LOAN_KEYWORDS)
}

/**
 * Hook to filter investment accounts from account data
 */
export const useFilterInvestmentAccounts = (accounts: Record<string, unknown>) => {
  const { isAccountType } = useAccountStore()
  
  return Object.keys(accounts).filter((accountName) => {
    const userClassified = isAccountType(accountName, 'investment')
    
    if (userClassified !== undefined) {
      return userClassified
    }
    
    // Fallback heuristic
    return matchesKeywords(accountName, INVESTMENT_KEYWORDS)
  })
}
