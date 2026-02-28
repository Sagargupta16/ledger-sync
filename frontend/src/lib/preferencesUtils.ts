/**
 * Preferences Utility Functions
 *
 * Helpers for classifying transactions based on user preferences
 */

import { usePreferencesStore, type IncomeClassification } from '@/store/preferencesStore'
import { rawColors } from '@/constants/colors'

// Income types now based on tax treatment classification
export type IncomeType = 'taxable' | 'investmentReturns' | 'cashback' | 'other'
export type SpendingType = 'essential' | 'discretionary'

interface Transaction {
  category?: string
  subcategory?: string
  type?: string
  amount?: number
  account?: string
}

// Get preferences from store (for non-React contexts)
const getPrefs = () => usePreferencesStore.getState()

/**
 * Check if a transaction's "Category::Subcategory" matches any item in a classification list
 */
const matchesClassification = (
  transaction: Transaction,
  classificationList: string[]
): boolean => {
  const category = transaction.category || ''
  const subcategory = transaction.subcategory || ''
  const itemKey = `${category}::${subcategory}`
  
  // Exact match
  if (classificationList.includes(itemKey)) return true
  
  // Case-insensitive match
  const lowerItemKey = itemKey.toLowerCase()
  return classificationList.some(item => item.toLowerCase() === lowerItemKey)
}

/**
 * Classify an income transaction by tax treatment type
 */
export const classifyIncomeType = (
  transaction: Transaction,
  customClassification?: IncomeClassification
): IncomeType => {
  const classification = customClassification || getPrefs().incomeClassification

  // Check each income type in order of specificity
  if (matchesClassification(transaction, classification.taxable)) return 'taxable'
  if (matchesClassification(transaction, classification.investmentReturns)) return 'investmentReturns'
  if (matchesClassification(transaction, classification.nonTaxable)) return 'cashback' // Non-taxable includes cashbacks
  if (matchesClassification(transaction, classification.other)) return 'other'

  return 'other'
}

/**
 * Classify an expense transaction as essential or discretionary
 */
export const classifySpendingType = (
  transaction: Transaction,
  customEssentialCategories?: string[]
): SpendingType => {
  const essentialCategories = customEssentialCategories || getPrefs().essentialCategories
  const category = transaction.category || ''

  // Check if category is in essential list (case-insensitive)
  const isEssential = essentialCategories.some(
    (essential) => essential.toLowerCase() === category.toLowerCase()
  )

  return isEssential ? 'essential' : 'discretionary'
}

/**
 * Get investment type for an account based on user mappings
 */
export const getInvestmentType = (
  accountName: string,
  customMappings?: Record<string, string>
): string => {
  const mappings = customMappings || getPrefs().investmentAccountMappings
  return mappings[accountName] || 'Other'
}

/**
 * Calculate income breakdown by tax treatment type from a list of transactions
 */
export const calculateIncomeBreakdown = (
  transactions: Transaction[],
  incomeClassification?: IncomeClassification
): Record<IncomeType, number> => {
  const breakdown: Record<IncomeType, number> = {
    taxable: 0,
    investmentReturns: 0,
    cashback: 0,
    other: 0,
  }

  transactions
    .filter((t) => t.type === 'Income')
    .forEach((t) => {
      const incomeType = classifyIncomeType(t, incomeClassification)
      breakdown[incomeType] += Math.abs(t.amount || 0)
    })

  return breakdown
}

/**
 * Calculate income breakdown by actual data category (for display in charts)
 */
export const calculateIncomeByCategoryBreakdown = (
  transactions: Transaction[]
): Record<string, number> => {
  const breakdown: Record<string, number> = {}

  transactions
    .filter((t) => t.type === 'Income')
    .forEach((t) => {
      const category = t.category || 'Other'
      breakdown[category] = (breakdown[category] || 0) + Math.abs(t.amount || 0)
    })

  return breakdown
}

/**
 * Get total cashbacks amount using preferences classification
 */
export const calculateCashbacksTotal = (
  transactions: Transaction[],
  incomeClassification?: IncomeClassification
): number => {
  const classification = incomeClassification || getPrefs().incomeClassification
  
  return transactions
    .filter((t) => t.type === 'Income')
    .filter((t) => matchesClassification(t, classification.nonTaxable))
    .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
}

/**
 * Get total taxable income using preferences classification
 */
export const calculateTaxableIncomeTotal = (
  transactions: Transaction[],
  incomeClassification?: IncomeClassification
): number => {
  const classification = incomeClassification || getPrefs().incomeClassification
  
  return transactions
    .filter((t) => t.type === 'Income')
    .filter((t) => matchesClassification(t, classification.taxable))
    .reduce((sum, t) => sum + Math.abs(t.amount || 0), 0)
}

/**
 * Calculate spending breakdown by essential vs discretionary
 */
export const calculateSpendingBreakdown = (
  transactions: Transaction[],
  essentialCategories?: string[]
): { essential: number; discretionary: number; total: number } => {
  let essential = 0
  let discretionary = 0

  transactions
    .filter((t) => t.type === 'Expense')
    .forEach((t) => {
      const spendingType = classifySpendingType(t, essentialCategories)
      const amount = Math.abs(t.amount || 0)
      if (spendingType === 'essential') {
        essential += amount
      } else {
        discretionary += amount
      }
    })

  return { essential, discretionary, total: essential + discretionary }
}

/**
 * Calculate investment breakdown by type from account balances
 */
export const calculateInvestmentBreakdown = (
  accounts: Record<string, { balance: number }>,
  investmentAccountNames: string[],
  customMappings?: Record<string, string>
): Record<string, number> => {
  const breakdown: Record<string, number> = {}

  investmentAccountNames.forEach((accountName) => {
    const accountData = accounts[accountName]
    if (accountData) {
      const investmentType = getInvestmentType(accountName, customMappings)
      breakdown[investmentType] = (breakdown[investmentType] || 0) + Math.abs(accountData.balance)
    }
  })

  return breakdown
}

/**
 * Get fiscal year dates based on user preference
 * @param fiscalYearStartMonth - Month number (1-12, e.g., 4 for April)
 * @param forYear - Optional year to get FY for (defaults to current FY)
 */
export const getFiscalYearDates = (
  fiscalYearStartMonth?: number,
  forYear?: number
): { startDate: Date; endDate: Date; fyLabel: string } => {
  const startMonth = fiscalYearStartMonth ?? getPrefs().fiscalYearStartMonth
  const now = new Date()
  const currentYear = forYear ?? now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12

  // Determine FY start year
  let fyStartYear = currentYear
  if (currentMonth < startMonth) {
    fyStartYear = currentYear - 1
  }

  const startDate = new Date(fyStartYear, startMonth - 1, 1)
  const endDate = new Date(fyStartYear + 1, startMonth - 1, 0) // Last day of month before start month next year

  // FY label (e.g., "FY 2025-26" for April 2025 - March 2026)
  const shortEndYear = (fyStartYear + 1).toString().slice(-2)
  const fyLabel = `FY ${fyStartYear}-${shortEndYear}`

  return { startDate, endDate, fyLabel }
}

/**
 * Income type display names (now by tax treatment)
 */
export const INCOME_TYPE_LABELS: Record<IncomeType, string> = {
  taxable: 'Taxable Income',
  investmentReturns: 'Investment Returns',
  cashback: 'Cashbacks & Refunds',
  other: 'Other Income',
}

/**
 * Income type colors for charts
 */
export const INCOME_TYPE_COLORS: Record<IncomeType, string> = {
  taxable: rawColors.ios.green,
  investmentReturns: rawColors.ios.orange,
  cashback: rawColors.ios.teal,
  other: rawColors.text.tertiary,
}

/**
 * Colors for actual data income categories (for display charts)
 */
export const INCOME_CATEGORY_COLORS: Record<string, string> = {
  'Employment Income': rawColors.ios.green,
  'Investment Income': rawColors.ios.orange,
  'Refund & Cashbacks': rawColors.ios.teal,
  'One-time Income': rawColors.ios.purple,
  'Other Income': rawColors.text.tertiary,
  'Business/Self Employment Income': rawColors.ios.pink,
}

/**
 * Spending type colors for charts
 */
export const SPENDING_TYPE_COLORS = {
  essential: rawColors.ios.blue,
  discretionary: rawColors.ios.orange,
}
