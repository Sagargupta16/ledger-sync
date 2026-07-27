import { describe, expect, it } from 'vitest'

import { classifyIncomeType } from '@/lib/preferencesUtils'
import { usePreferencesStore } from '@/store/preferencesStore'
import type { Transaction } from '@/types'

/**
 * The income-classification defaults are EXACT-MATCH "Category::Subcategory"
 * keys (`matchesClassification` in `lib/preferencesUtils.ts`). A key that no
 * transaction carries contributes zero SILENTLY -- nothing throws, a KPI just
 * reads 0. So the defaults have to match the category names real exports use.
 *
 * Every pair asserted below is a (category, subcategory) combination that
 * actually occurs in a real exported ledger, verified with:
 *
 *   sqlite> SELECT category, subcategory, COUNT(*), ROUND(SUM(amount),2)
 *           FROM transactions
 *           WHERE type='INCOME' AND is_deleted=0   -- the analytics basis
 *           GROUP BY 1,2;
 *
 * `is_deleted=0` is not optional: every analytics read goes through
 * `_user_transaction_query`, which filters soft-deleted rows, so an aggregate
 * measured without it overstates several of these keys. Absolute row counts and
 * amounts stay out of tracked source (this repo is public); the measurements
 * live in the untracked study notes under `.claude/docs/studies/`.
 *
 * What matters for the assertions is which spellings exist and which do not:
 * the shipped defaults used "Refund & Cashbacks" (SINGULAR), "Deposits Return",
 * "Stock Market Profits" / "F&O Income" and "One-time Income::Gifts" --
 * every one of those matched ZERO rows, while the plural "Refunds & Cashbacks",
 * "Deposit Return", "Stock Market Profit", "F&O Profits" and "Other
 * Income::Gifts" are what the data carries.
 */
function income(category: string, subcategory: string): Transaction {
  return {
    id: `${category}::${subcategory}`,
    date: '2026-03-15',
    amount: 1000,
    type: 'Income',
    category,
    subcategory,
    account: 'Bank: SBI',
  }
}

/** Classify against the shipped defaults, not whatever the store currently holds. */
function classifyWithDefaults(tx: Transaction) {
  const { incomeClassification } = usePreferencesStore.getState()
  return classifyIncomeType(tx, incomeClassification)
}

describe('income classification defaults vs real category names', () => {
  it.each([
    ['Refunds & Cashbacks', 'Credit Card Cashbacks'],
    ['Refunds & Cashbacks', 'Other Cashbacks'],
    ['Refunds & Cashbacks', 'Product/Service Refunds'],
    ['Refunds & Cashbacks', 'Deposit Return'],
  ])('classifies the real plural %s::%s as cashback, not other', (category, subcategory) => {
    expect(classifyWithDefaults(income(category, subcategory))).toBe('cashback')
  })

  it('still classifies the historical singular spelling as cashback', () => {
    // Back-compat: an existing user whose export used the singular name must not
    // regress when the plural names are added.
    expect(classifyWithDefaults(income('Refund & Cashbacks', 'Credit Card Cashbacks'))).toBe(
      'cashback',
    )
  })

  it.each([
    ['Investment Income', 'Stock Market Profit'],
    ['Investment Income', 'F&O Profits'],
    ['Investment Income', 'Dividends'],
    ['Investment Income', 'Interest'],
  ])('classifies the real %s::%s as investmentReturns', (category, subcategory) => {
    expect(classifyWithDefaults(income(category, subcategory))).toBe('investmentReturns')
  })

  it.each([
    ['Employment Income', 'Salary'],
    ['Employment Income', 'Stipend'],
    ['Employment Income', 'Bonuses'],
    ['Employment Income', 'RSUs'],
  ])('keeps the real %s::%s taxable', (category, subcategory) => {
    expect(classifyWithDefaults(income(category, subcategory))).toBe('taxable')
  })

  it('does not tax cashback, which is what the drifted key silently did', () => {
    // With the singular-only defaults, a real "Refunds & Cashbacks" row matched
    // nothing and fell through to 'other'. It must never land in 'taxable'.
    for (const sub of ['Credit Card Cashbacks', 'Other Cashbacks']) {
      expect(classifyWithDefaults(income('Refunds & Cashbacks', sub))).not.toBe('taxable')
    }
  })

  it('exposes every default key in Category::Subcategory form', () => {
    const { incomeClassification } = usePreferencesStore.getState()
    const all = [
      ...incomeClassification.taxable,
      ...incomeClassification.investmentReturns,
      ...incomeClassification.nonTaxable,
      ...incomeClassification.other,
    ]
    expect(all.length).toBeGreaterThan(0)
    for (const key of all) {
      expect(key).toContain('::')
      // A trailing/leading space would break exact match just as silently.
      expect(key).toBe(key.trim())
    }
  })

  it('lists the real plural cashback keys in the nonTaxable defaults', () => {
    const { nonTaxable } = usePreferencesStore.getState().incomeClassification
    expect(nonTaxable).toContain('Refunds & Cashbacks::Credit Card Cashbacks')
    expect(nonTaxable).toContain('Refunds & Cashbacks::Other Cashbacks')
    expect(nonTaxable).toContain('Refunds & Cashbacks::Product/Service Refunds')
    expect(nonTaxable).toContain('Refunds & Cashbacks::Deposit Return')
  })
})
