/**
 * Guards the account-type vocabulary the Net Worth page groups by.
 *
 * `resolveAccountCategory` used to switch on string literals, and one of the
 * cases -- `case 'Loans':` -- matched no value the backend can ever serve.
 * `AccountType.LOANS` in `backend/src/ledger_sync/db/_models/enums.py` serializes
 * as `'Loans/Lended'`; the column stores the enum NAME (`LOANS`) and the API
 * hands back `.value`, so `'Loans'` appeared on neither side of the wire. No
 * migration ever wrote it either, so it was not a legacy value in real rows --
 * just drift.
 *
 * These tests pin the vocabulary itself against `ACCOUNT_TYPE_VALUES`, the shared
 * wire list, so a category map that stops covering a real backend value fails
 * here rather than silently dumping accounts into `Other`.
 */

import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_TYPE_VALUES,
  UNCLASSIFIED_ACCOUNT_TYPE,
} from '@/services/api/accountClassifications'

import {
  NON_ASSET_CATEGORIES,
  computeNetWorthTimeSeries,
  resolveAccountCategory,
} from '../netWorthUtils'

const NO_MAPPINGS: Record<string, unknown> = {}

describe('resolveAccountCategory -- wire vocabulary coverage', () => {
  it('maps every backend account type without falling through to a heuristic', () => {
    // Deliberately opaque name: it matches no keyword, so anything other than a
    // real classification hit lands in 'Other'. That makes the assertion below
    // prove the classification branch fired for every wire value.
    const opaque = 'Zzz 9911'
    for (const accountType of ACCOUNT_TYPE_VALUES) {
      const category = resolveAccountCategory(opaque, { [opaque]: accountType }, NO_MAPPINGS)
      expect(category, `${accountType} fell through to the name heuristics`).not.toBe('Other')
    }
  })

  it.each(ACCOUNT_TYPE_VALUES)('classifies %s the same way regardless of the name', (accountType) => {
    // Two names that would take DIFFERENT heuristic branches ('bank' vs 'card').
    // An explicit classification must win over both, identically.
    const viaBankName = resolveAccountCategory(
      'Some Bank',
      { 'Some Bank': accountType },
      NO_MAPPINGS,
    )
    const viaCardName = resolveAccountCategory(
      'Some Card',
      { 'Some Card': accountType },
      NO_MAPPINGS,
    )
    expect(viaBankName).toBe(viaCardName)
  })

  it('groups the Loans/Lended enum value, which is the only loan value on the wire', () => {
    expect(
      resolveAccountCategory('Friends Account', { 'Friends Account': 'Loans/Lended' }, NO_MAPPINGS),
    ).toBe('Loans/Lended')
    // `'Loans'` is NOT a wire value. It must not be treated as a classification:
    // the name heuristics decide instead, and 'Zzz 9911' matches none of them.
    expect(resolveAccountCategory('Zzz 9911', { 'Zzz 9911': 'Loans' }, NO_MAPPINGS)).toBe('Other')
  })

  it('collapses Cash and Other Wallets into one display bucket', () => {
    expect(resolveAccountCategory('Zzz 9911', { 'Zzz 9911': 'Cash' }, NO_MAPPINGS)).toBe(
      'Cash & Wallets',
    )
    expect(resolveAccountCategory('Zzz 9911', { 'Zzz 9911': 'Other Wallets' }, NO_MAPPINGS)).toBe(
      'Cash & Wallets',
    )
  })

  it('passes the unclassified fallback through to the name heuristics', () => {
    // The API serves 'Other' for an account with no classification row, so the
    // name is still the best signal available.
    expect(
      resolveAccountCategory(
        'HDFC Credit Card',
        { 'HDFC Credit Card': UNCLASSIFIED_ACCOUNT_TYPE },
        NO_MAPPINGS,
      ),
    ).toBe('Credit Cards')
  })

  it('falls back to heuristics for a value outside the wire vocabulary', () => {
    // A backend enum member the frontend has not been taught: guessing from the
    // name beats grouping under a category no chart knows how to colour.
    expect(
      resolveAccountCategory('SBI Bank', { 'SBI Bank': 'Crypto Wallets' }, NO_MAPPINGS),
    ).toBe('Bank Accounts')
  })

  it('treats an investment mapping as Investments when unclassified', () => {
    expect(resolveAccountCategory('Zzz 9911', {}, { 'Zzz 9911': 'stocks' })).toBe('Investments')
  })
})

describe('NON_ASSET_CATEGORIES', () => {
  it('excludes the liability categories and the unclassified bucket', () => {
    expect([...NON_ASSET_CATEGORIES].sort()).toEqual(['Credit Cards', 'Loans/Lended', 'Other'])
  })

  it('lists only categories resolveAccountCategory can actually return', () => {
    // A stale entry (the dead `'Loans'` literal that used to sit in the
    // exclusion array in useNetWorth) excludes nothing, so it must not exist.
    const reachable = new Set(
      ACCOUNT_TYPE_VALUES.map((accountType) =>
        resolveAccountCategory('Zzz 9911', { 'Zzz 9911': accountType }, NO_MAPPINGS),
      ),
    )
    reachable.add(resolveAccountCategory('Zzz 9911', {}, NO_MAPPINGS))
    for (const category of NON_ASSET_CATEGORIES) {
      expect(reachable, `${category} is not reachable`).toContain(category)
    }
  })
})

describe('computeNetWorthTimeSeries', () => {
  it('splits positive net worth across the supplied categories', () => {
    const series = computeNetWorthTimeSeries(
      [
        { date: '2026-01-31', type: 'Income', amount: 100 },
        { date: '2026-02-28', type: 'Expense', amount: 40 },
      ],
      ['Bank Accounts', 'Investments'],
      { 'Bank Accounts': 0.75, Investments: 0.25 },
    )
    expect(series).toHaveLength(2)
    expect(series[1]).toMatchObject({
      date: '2026-02-28',
      netWorth: 60,
      'Bank Accounts': 45,
      Investments: 15,
    })
  })
})
