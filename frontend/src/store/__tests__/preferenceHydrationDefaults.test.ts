import { beforeEach, describe, expect, it } from 'vitest'

import {
  calculateCashbacksTotal,
  calculateSpendingBreakdown,
  classifyIncomeType,
} from '@/lib/preferencesUtils'
import {
  resolveEssentialCategories,
  resolveIncomeClassification,
  usePreferencesStore,
  withIncomeClassificationDefaults,
} from '@/store/preferencesStore'
import type { Transaction } from '@/types'
import { DEFAULT_GROWTH_ASSUMPTIONS } from '@/types/salary'

/**
 * `hydrateFromApi` used to overwrite the shipped list defaults with whatever the
 * server sent, including an empty array.
 *
 * The backend stores these preferences as JSON text whose column default is the
 * string `"[]"`, and three write paths put that there for a user who has
 * configured nothing: the model default, `_get_or_create_preferences`, and
 * `POST /api/preferences/reset`. So `essential_categories: []` off the wire is
 * "not configured", not "nothing is essential" -- but hydration honoured it and
 * left the store's `essentialCategories` empty.
 *
 * Consequence, measured against the owner's live ledger: essential share went
 * from roughly seven tenths under the 7 shipped defaults to 0.00% -- 100% of
 * spend booked discretionary, so 50/30/20, Lean FIRE, and every needs/wants
 * surface read 0% needs. Absolute amounts stay out of tracked source (this repo
 * is public); the measurements live in the untracked study notes under
 * .claude/docs/studies/.
 *
 * Fixing the STORE alone was not enough, which is why the resolver tests below
 * exist: `preferencesUtils` takes the list as an optional override
 * (`custom ?? getPrefs().x`), and every real consumer passed the raw
 * `usePreferences()` payload, so an explicit `[]` short-circuited the corrected
 * store value. The call sites now resolve the payload first.
 */

const API_PREFS_NEW_USER = {
  number_format: 'indian' as const,
  currency_symbol: '₹',
  currency_symbol_position: 'before' as const,
  default_time_range: 'all_time',
  display_currency: 'INR',
  fiscal_year_start_month: 4,
  // Exactly what the backend returns for an untouched preferences row.
  essential_categories: [],
  taxable_income_categories: [],
  investment_returns_categories: [],
  non_taxable_income_categories: [],
  other_income_categories: [],
  investment_account_mappings: {},
  needs_target_percent: 50,
  wants_target_percent: 30,
  savings_target_percent: 20,
  credit_card_limits: {},
  earning_start_date: null,
  use_earning_start_date: false,
  salary_structure: {},
  rsu_grants: [],
  growth_assumptions: DEFAULT_GROWTH_ASSUMPTIONS,
}

const SHIPPED_ESSENTIALS = [
  'Housing',
  'Healthcare',
  'Transportation',
  'Food & Dining',
  'Education',
  'Family',
  'Utilities',
]

function expense(category: string, amount: number): Transaction {
  return {
    id: `${category}-${amount}`,
    date: '2026-04-10',
    amount,
    type: 'Expense',
    category,
    account: 'Bank: SBI',
  }
}

function income(category: string, subcategory: string): Transaction {
  return {
    id: `${category}::${subcategory}`,
    date: '2026-04-30',
    amount: 1000,
    type: 'Income',
    category,
    subcategory,
    account: 'Bank: SBI',
  }
}

beforeEach(() => {
  usePreferencesStore.getState().reset()
})

describe('hydrateFromApi with an unconfigured (empty) preferences row', () => {
  it('keeps the 7 shipped essential categories', () => {
    usePreferencesStore.getState().hydrateFromApi(API_PREFS_NEW_USER)

    expect(usePreferencesStore.getState().essentialCategories).toEqual(SHIPPED_ESSENTIALS)
  })

  it('still splits needs from wants after hydration', () => {
    usePreferencesStore.getState().hydrateFromApi(API_PREFS_NEW_USER)

    const breakdown = calculateSpendingBreakdown([
      expense('Housing', 2000),
      expense('Shopping', 1000),
    ])

    // Before the fix this was essential 0 / discretionary 3000, matching the
    // 0.00% essential share measured on real data.
    expect(breakdown.essential).toBe(2000)
    expect(breakdown.discretionary).toBe(1000)
  })

  it('keeps every income-classification default', () => {
    usePreferencesStore.getState().hydrateFromApi(API_PREFS_NEW_USER)
    const { incomeClassification } = usePreferencesStore.getState()

    expect(incomeClassification.taxable).toContain('Employment Income::Salary')
    expect(incomeClassification.investmentReturns).toContain('Investment Income::Dividends')
    expect(incomeClassification.nonTaxable).toContain(
      'Refunds & Cashbacks::Credit Card Cashbacks',
    )
    expect(incomeClassification.other).toContain('Other Income::Pocket Money')
  })

  it('still classifies salary as taxable after hydration', () => {
    usePreferencesStore.getState().hydrateFromApi(API_PREFS_NEW_USER)
    const { incomeClassification } = usePreferencesStore.getState()

    expect(classifyIncomeType(income('Employment Income', 'Salary'), incomeClassification)).toBe(
      'taxable',
    )
  })
})

describe('hydrateFromApi with an explicitly configured row', () => {
  it('honours the user list verbatim and drops the defaults', () => {
    usePreferencesStore.getState().hydrateFromApi({
      ...API_PREFS_NEW_USER,
      essential_categories: ['Rent', 'Groceries'],
    })

    const { essentialCategories } = usePreferencesStore.getState()
    expect(essentialCategories).toEqual(['Rent', 'Groceries'])
    // Opting OUT of a shipped default must stick, or configuring is a no-op.
    expect(essentialCategories).not.toContain('Housing')
  })

  it('honours a configured income-classification list verbatim', () => {
    usePreferencesStore.getState().hydrateFromApi({
      ...API_PREFS_NEW_USER,
      taxable_income_categories: ['Custom::Only'],
    })

    expect(usePreferencesStore.getState().incomeClassification.taxable).toEqual(['Custom::Only'])
  })

  it('leaves mappings and limits empty, where empty IS a real state', () => {
    usePreferencesStore.getState().hydrateFromApi(API_PREFS_NEW_USER)

    // The shipped default for these is empty too (populating investment
    // mappings would leak the maintainer's account names), so unset and
    // explicitly-empty coincide and must not gain a fabricated default.
    expect(usePreferencesStore.getState().investmentAccountMappings).toEqual({})
    expect(usePreferencesStore.getState().creditCardLimits).toEqual({})
  })
})

/**
 * The four income lists are a PARTITION written by one exclusive-assignment UI
 * (`IncomeClassificationSection.handleClassify` removes the item from all four
 * and appends it to exactly one), so the fallback is decided for the GROUP.
 * Injecting the defaults per field would re-tax income the user explicitly
 * marked non-taxable.
 */
describe('income-classification group rule', () => {
  it('applies defaults only when nothing is classified anywhere', () => {
    const resolved = resolveIncomeClassification(API_PREFS_NEW_USER)

    expect(resolved.taxable).toContain('Employment Income::Salary')
    expect(resolved.nonTaxable).toContain('Refunds & Cashbacks::Other Cashbacks')
  })

  it('honours a deliberate empty list when a sibling is configured', () => {
    const resolved = resolveIncomeClassification({
      ...API_PREFS_NEW_USER,
      non_taxable_income_categories: ['Employment Income::Salary'],
    })

    // Salary was filed as non-taxable, so the taxable defaults must NOT come
    // back and re-tax it.
    expect(resolved.taxable).toEqual([])
    expect(resolved.investmentReturns).toEqual([])
    expect(resolved.other).toEqual([])
    expect(resolved.nonTaxable).toEqual(['Employment Income::Salary'])
  })

  it('does not re-tax income the user filed as non-taxable', () => {
    usePreferencesStore.getState().hydrateFromApi({
      ...API_PREFS_NEW_USER,
      non_taxable_income_categories: ['Employment Income::Salary'],
    })
    const { incomeClassification } = usePreferencesStore.getState()

    // `classifyIncomeType` checks taxable FIRST, so re-injecting the taxable
    // defaults (which include "Employment Income::Salary") into the empty list
    // beat the user's own non-taxable entry. 'cashback' is this function's label
    // for the non-taxable bucket.
    expect(classifyIncomeType(income('Employment Income', 'Salary'), incomeClassification)).toBe(
      'cashback',
    )
  })

  it('treats a reset row (shipped non-taxable, three empty) as unconfigured', () => {
    // POST /api/preferences/reset persists the 9 non-taxable defaults verbatim
    // while writing "[]" for the other three. A naive "any sibling populated"
    // rule would mark the group configured and leave those three empty --
    // re-opening this bug for every user who hits Reset.
    const shippedNonTaxable = resolveIncomeClassification(API_PREFS_NEW_USER).nonTaxable
    const resolved = resolveIncomeClassification({
      ...API_PREFS_NEW_USER,
      non_taxable_income_categories: shippedNonTaxable,
    })

    expect(resolved.taxable).toContain('Employment Income::Salary')
    expect(resolved.investmentReturns).toContain('Investment Income::Interest')
    expect(resolved.other).toContain('Other Income::Gifts')
  })

  it('counts shipped-default-plus-one-key as a real user choice', () => {
    const shippedNonTaxable = resolveIncomeClassification(API_PREFS_NEW_USER).nonTaxable
    const resolved = resolveIncomeClassification({
      ...API_PREFS_NEW_USER,
      non_taxable_income_categories: [...shippedNonTaxable, 'Extra::Key'],
    })

    expect(resolved.taxable).toEqual([])
    expect(resolved.other).toEqual([])
  })

  it('resolves an already-built camelCase classification the same way', () => {
    // `useTaxPlanning` / `useIncomeExpenseFlow` build this shape with `?? []`
    // per field and are not editable, so `groupTransactionsByFY` resolves it
    // downstream through this entry point.
    const resolved = withIncomeClassificationDefaults({
      taxable: [],
      investmentReturns: [],
      nonTaxable: [],
      other: [],
    })

    expect(resolved.taxable).toContain('Employment Income::Salary')
  })
})

/**
 * Call-site shape: every real consumer forwards the RAW payload as the override
 * argument, and `preferencesUtils` uses `custom ?? getPrefs().x`, so `[]`
 * short-circuits even a perfectly hydrated store. These are the tests the
 * store-only suite above could not fail on.
 */
describe('call-site resolvers (the store fix alone was unreachable)', () => {
  it('resolveEssentialCategories restores defaults for an empty payload', () => {
    expect(resolveEssentialCategories([])).toEqual(SHIPPED_ESSENTIALS)
    expect(resolveEssentialCategories(undefined)).toEqual(SHIPPED_ESSENTIALS)
  })

  it('resolveEssentialCategories honours a configured payload verbatim', () => {
    expect(resolveEssentialCategories(['Rent'])).toEqual(['Rent'])
  })

  it('splits needs from wants through the useSpendingAnalysis call shape', () => {
    // Mirrors useSpendingAnalysis: hydrate the store from the API payload, then
    // pass that payload's list on as the override. Passing
    // `preferences.essential_categories` raw gave essential 0 / discretionary
    // 3000 even with the store fixed.
    usePreferencesStore.getState().hydrateFromApi(API_PREFS_NEW_USER)

    const breakdown = calculateSpendingBreakdown(
      [expense('Housing', 2000), expense('Shopping', 1000)],
      resolveEssentialCategories(API_PREFS_NEW_USER.essential_categories),
    )

    expect(breakdown.essential).toBe(2000)
    expect(breakdown.discretionary).toBe(1000)
  })

  it('totals cashbacks through the useDashboardMetrics call shape', () => {
    usePreferencesStore.getState().hydrateFromApi(API_PREFS_NEW_USER)

    // The old shape was `{ taxable: preferences.taxable_income_categories || [], ... }`,
    // i.e. four empty lists, so no key matched and the cashback KPI read 0.
    const cashbacks = [
      income('Refunds & Cashbacks', 'Credit Card Cashbacks'),
      income('Refunds & Cashbacks', 'Other Cashbacks'),
    ]

    expect(
      calculateCashbacksTotal(cashbacks, resolveIncomeClassification(API_PREFS_NEW_USER)),
    ).toBe(2000)
  })
})
