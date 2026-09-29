/**
 * Default user-scoped preference values and the fresh-copy builder used by
 * the store initializer and `reset()`.
 *
 * Re-exported by `@/store/preferencesStore`, the public import path; import
 * from there rather than from this module.
 */

import { BASE_CURRENCY } from '@/constants/currencies'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'

/**
 * Default user-scoped preference values. Shared by the store initializer and
 * `reset()` (called on logout) so a fresh build and a post-logout reset stay in
 * sync. Excludes the live exchange rate (transient, cleared separately).
 */
export const DEFAULT_USER_PREFS = {
  displayPreferences: {
    numberFormat: 'indian' as const,
    currencySymbol: '₹',
    currencySymbolPosition: 'before' as const,
    defaultTimeRange: 'all_time',
  },
  displayCurrency: BASE_CURRENCY,
  exchangeRate: null,
  exchangeRateUpdatedAt: null,
  fiscalYearStartMonth: 4,
  essentialCategories: [
    'Housing',
    'Healthcare',
    'Transportation',
    'Food & Dining',
    'Education',
    'Family',
    'Utilities',
  ],
  // Income classification (by tax treatment), "Category::Subcategory" format.
  //
  // These are EXACT-MATCH keys (see `matchesClassification` in preferencesUtils):
  // a key that no transaction carries silently contributes zero, so a wrong
  // spelling does not error -- it just makes a KPI read 0. Several defaults here
  // drifted from the category names real exports actually use, so both the
  // drifted key and the real one are listed. An unmatched key costs nothing;
  // a missing one costs money.
  //
  // Names verified against a real exported ledger. Notably:
  //  - "Refunds & Cashbacks" (PLURAL) is what the data carries. The
  //    "Refund & Cashbacks" singular default matched 0 rows, so the cashback KPI
  //    read 0 for a ledger with a material amount of it.
  //  - "Deposit Return" (singular Deposit), not "Deposits Return".
  //  - "Stock Market Profit" (singular) and "F&O Profits", not "Stock Market
  //    Profits" / "F&O Income": realised market profit was falling through to
  //    "other" instead of investment returns.
  //  - Gifts and Pocket Money live under "Other Income", not "One-time Income".
  //    NOTE: the `other` list is INERT for classification -- `classifyIncomeType`
  //    already returns 'other' as its final fallback, so an unlisted key lands in
  //    the same bucket as a listed one and these keys move no money. They exist
  //    so the Settings classification UI shows them as assigned rather than
  //    unclassified, and so `withIncomeClassificationDefaults`' group rule can
  //    tell a reset row from a user choice.
  // Absolute amounts stay out of tracked source (this repo is public); the
  // measurements live in the untracked study notes under .claude/docs/studies/.
  incomeClassification: {
    taxable: [
      'Employment Income::Salary',
      'Employment Income::Stipend',
      'Employment Income::Bonuses',
      'Employment Income::RSUs',
      'Business/Self Employment Income::Gig Work Income',
    ],
    investmentReturns: [
      'Investment Income::Dividends',
      'Investment Income::Interest',
      'Investment Income::F&O Income',
      'Investment Income::F&O Profits',
      'Investment Income::Stock Market Profits',
      'Investment Income::Stock Market Profit',
    ],
    nonTaxable: [
      'Refund & Cashbacks::Credit Card Cashbacks',
      'Refund & Cashbacks::Other Cashbacks',
      'Refund & Cashbacks::Product/Service Refunds',
      'Refund & Cashbacks::Deposits Return',
      'Refunds & Cashbacks::Credit Card Cashbacks',
      'Refunds & Cashbacks::Other Cashbacks',
      'Refunds & Cashbacks::Product/Service Refunds',
      'Refunds & Cashbacks::Deposit Return',
      'Employment Income::Expense Reimbursement',
    ],
    other: [
      'One-time Income::Gifts',
      'One-time Income::Pocket Money',
      'One-time Income::Competition/Contest Prizes',
      'Other Income::Gifts',
      'Other Income::Pocket Money',
      'Other Income::Freelance Income',
      'Other Income::Uncategorised',
      'Employment Income::EPF Contribution',
      'Other::Other',
    ],
  },
  investmentAccountMappings: {},
  needsTargetPercent: 50,
  wantsTargetPercent: 30,
  savingsTargetPercent: 20,
  creditCardLimits: {},
  earningStartDate: null,
  useEarningStartDate: false,
  salaryStructure: {},
  rsuGrants: [],
}

/** Build a fresh copy of the defaults (deep-ish; arrays/objects re-created). */
export function freshDefaults() {
  return {
    ...DEFAULT_USER_PREFS,
    displayPreferences: { ...DEFAULT_USER_PREFS.displayPreferences },
    essentialCategories: [...DEFAULT_USER_PREFS.essentialCategories],
    incomeClassification: {
      taxable: [...DEFAULT_USER_PREFS.incomeClassification.taxable],
      investmentReturns: [...DEFAULT_USER_PREFS.incomeClassification.investmentReturns],
      nonTaxable: [...DEFAULT_USER_PREFS.incomeClassification.nonTaxable],
      other: [...DEFAULT_USER_PREFS.incomeClassification.other],
    },
    investmentAccountMappings: {},
    creditCardLimits: {},
    salaryStructure: {},
    rsuGrants: [],
    growthAssumptions: { ...DEFAULT_GROWTH_ASSUMPTIONS },
  }
}
