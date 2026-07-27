import { describe, it, expect } from 'vitest'
import {
  auditIncomeClassification,
  getDefaultIncomeClassifications,
  suggestIncomeBucket,
  type IncomeFacet,
} from '../helpers'

/**
 * The four `*_income_categories` preference lists are exact-match key sets and
 * a stored non-empty list is honoured verbatim by the backend, so the shipped
 * defaults never gap-fill a partially-configured list. These tests pin the two
 * silent failure modes the audit exists to surface.
 */

const EMPTY_LISTS = { taxable: [], investment: [], non_taxable: [], other: [] }

describe('suggestIncomeBucket', () => {
  it.each([
    ['Salary', 'Basic Salary', 'taxable'],
    ['Salary', 'Performance Bonus', 'taxable'],
    ['Investment Returns', 'Dividends', 'investment'],
    ['Investment Returns', 'Savings Account Interest', 'investment'],
    ['Refunds & Cashbacks', 'Credit Card Cashbacks', 'non_taxable'],
    ['Refunds & Cashbacks', 'Product/Service Refunds', 'non_taxable'],
    ['Refunds & Cashbacks', 'Deposit Return', 'non_taxable'],
    ['Other Income', 'Gifts Received', 'other'],
  ])('maps %s / %s to %s', (category, subcategory, expected) => {
    expect(suggestIncomeBucket(category, subcategory)).toBe(expected)
  })

  it('returns null when no keyword matches, instead of guessing', () => {
    expect(suggestIncomeBucket('Mystery Inflow', 'Something Unnamed')).toBeNull()
  })

  it('prefers the subcategory keyword over the parent category keyword', () => {
    // 'Other Income' would match the 'other' rule via the category, but the
    // subcategory is unambiguous salary.
    expect(suggestIncomeBucket('Other Income', 'Consulting Retainer')).toBe('taxable')
  })
})

describe('auditIncomeClassification', () => {
  /**
   * Reproduces the reported real-data state: `non_taxable_income_categories`
   * holds four keys, two of them the drifted SINGULAR "Refund & Cashbacks"
   * spelling that matches zero rows, while the two PLURAL refund buckets that
   * do exist in the ledger appear in no list at all.
   */
  const DRIFTED_FACETS: IncomeFacet[] = [
    { category: 'Salary', subcategory: 'Basic Salary', count: 30, total: 1_500_000 },
    {
      category: 'Refunds & Cashbacks',
      subcategory: 'Credit Card Cashbacks',
      count: 40,
      total: 8_000,
    },
    { category: 'Refunds & Cashbacks', subcategory: 'Other Cashbacks', count: 12, total: 2_500 },
    {
      category: 'Refunds & Cashbacks',
      subcategory: 'Product/Service Refunds',
      count: 21,
      total: 4_475.8,
    },
    { category: 'Refunds & Cashbacks', subcategory: 'Deposit Return', count: 1, total: 200 },
  ]

  const DRIFTED_LISTS = {
    taxable: ['Salary::Basic Salary'],
    investment: [],
    non_taxable: [
      'Refunds & Cashbacks::Credit Card Cashbacks',
      'Refunds & Cashbacks::Other Cashbacks',
      'Refund & Cashbacks::Credit Card Cashbacks',
      'Refund & Cashbacks::Other Cashbacks',
    ],
    other: [],
  }

  it('flags exactly the refund buckets no list claims, with their money impact', () => {
    const audit = auditIncomeClassification(DRIFTED_FACETS, DRIFTED_LISTS)

    expect(audit.unclassified.map((item) => item.key)).toEqual([
      'Refunds & Cashbacks::Product/Service Refunds',
      'Refunds & Cashbacks::Deposit Return',
    ])
    // The number from the report: 21 + 1 rows, 4,475.80 + 200.00.
    expect(audit.unclassifiedRows).toBe(22)
    expect(audit.unclassifiedTotal).toBeCloseTo(4_675.8, 2)
  })

  it('suggests non_taxable for both, so one click classifies all 22 rows', () => {
    const audit = auditIncomeClassification(DRIFTED_FACETS, DRIFTED_LISTS)
    expect(audit.unclassified.every((item) => item.suggested === 'non_taxable')).toBe(true)

    // Applying the suggestions leaves nothing unclassified and moves nothing
    // that was already configured.
    const applied = {
      ...DRIFTED_LISTS,
      non_taxable: [
        ...DRIFTED_LISTS.non_taxable,
        ...audit.unclassified.map((item) => item.key),
      ],
    }
    const after = auditIncomeClassification(DRIFTED_FACETS, applied)
    expect(after.unclassified).toEqual([])
    expect(after.unclassifiedTotal).toBe(0)
    expect(after.unclassifiedRows).toBe(0)
    expect(applied.taxable).toEqual(DRIFTED_LISTS.taxable)
  })

  it('reports the drifted singular keys as dead, with the list holding them', () => {
    const audit = auditIncomeClassification(DRIFTED_FACETS, DRIFTED_LISTS)
    expect(audit.deadKeys).toEqual([
      { key: 'Refund & Cashbacks::Credit Card Cashbacks', classification: 'non_taxable' },
      { key: 'Refund & Cashbacks::Other Cashbacks', classification: 'non_taxable' },
    ])
  })

  it('sorts unclassified buckets by money impact, biggest first', () => {
    const audit = auditIncomeClassification(
      [
        { category: 'A', subcategory: 'Small', count: 5, total: 100 },
        { category: 'A', subcategory: 'Big', count: 1, total: 90_000 },
        { category: 'A', subcategory: 'Mid', count: 3, total: 5_000 },
      ],
      EMPTY_LISTS,
    )
    expect(audit.unclassified.map((item) => item.subcategory)).toEqual(['Big', 'Mid', 'Small'])
  })

  it('treats a case-only difference as classified, mirroring matchesClassification', () => {
    const audit = auditIncomeClassification(
      [{ category: 'Salary', subcategory: 'Basic Salary', count: 1, total: 100 }],
      { ...EMPTY_LISTS, taxable: ['salary::basic salary'] },
    )
    expect(audit.unclassified).toEqual([])
    expect(audit.deadKeys).toEqual([])
  })

  it('attributes a key present in two lists to the first list consumers check', () => {
    const audit = auditIncomeClassification(
      [{ category: 'Salary', subcategory: 'Basic Salary', count: 1, total: 100 }],
      {
        ...EMPTY_LISTS,
        taxable: ['Salary::Basic Salary'],
        other: ['Salary::Basic Salary'],
      },
    )
    // Consumers resolve taxable -> investment -> non_taxable -> other, so the
    // duplicate in `other` is inert rather than dead.
    expect(audit.unclassified).toEqual([])
    expect(audit.deadKeys).toEqual([])
  })

  it('finds nothing to report on an empty ledger with empty lists', () => {
    const audit = auditIncomeClassification([], EMPTY_LISTS)
    expect(audit).toEqual({
      unclassified: [],
      deadKeys: [],
      unclassifiedTotal: 0,
      unclassifiedRows: 0,
    })
  })

  it('flags a bucket no keyword rule covers with a null suggestion', () => {
    const audit = auditIncomeClassification(
      [
        {
          category: 'One-time Income',
          subcategory: 'Selling Assets (car, property etc.)',
          count: 1,
          total: 7_000,
        },
      ],
      { ...EMPTY_LISTS, taxable: ['Salary::Basic Salary'] },
    )
    expect(audit.unclassified).toHaveLength(1)
    // 'one-time' matches on the category, so this one has a suggestion; the
    // point of the assertion is that a partially-configured list still gets
    // audited rather than skipped.
    expect(audit.unclassified[0].suggested).toBe('other')
    expect(audit.deadKeys).toEqual([{ key: 'Salary::Basic Salary', classification: 'taxable' }])
  })
})

describe('getDefaultIncomeClassifications', () => {
  it('shares its keyword rules with the audit suggestions', () => {
    const defaults = getDefaultIncomeClassifications(
      { 'Refunds & Cashbacks': ['Product/Service Refunds', 'Deposit Return'] },
      EMPTY_LISTS,
    )
    expect(defaults.non_taxable).toEqual([
      'Refunds & Cashbacks::Product/Service Refunds',
      'Refunds & Cashbacks::Deposit Return',
    ])

    const audit = auditIncomeClassification(
      [
        {
          category: 'Refunds & Cashbacks',
          subcategory: 'Product/Service Refunds',
          count: 21,
          total: 4_475.8,
        },
        { category: 'Refunds & Cashbacks', subcategory: 'Deposit Return', count: 1, total: 200 },
      ],
      EMPTY_LISTS,
    )
    expect(audit.unclassified.map((item) => item.suggested)).toEqual([
      'non_taxable',
      'non_taxable',
    ])
  })

  it('leaves already-classified items in place', () => {
    const defaults = getDefaultIncomeClassifications(
      { Salary: ['Basic Salary'] },
      { ...EMPTY_LISTS, other: ['Salary::Basic Salary'] },
    )
    expect(defaults.taxable).toEqual([])
    expect(defaults.other).toEqual(['Salary::Basic Salary'])
  })
})
