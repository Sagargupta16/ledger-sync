import { describe, it, expect } from 'vitest'
import {
  capitalLossConfig,
  capitalLossKeySet,
  classificationKey,
  classifyExpense,
  isCapitalLoss,
  isSpending,
  looksLikeCapitalLoss,
  splitExpenseTotals,
  type ExpenseClass,
  type ExpenseClassifiable,
} from '../expenseClassification'

const tx = (over: Partial<ExpenseClassifiable> = {}): ExpenseClassifiable => ({
  type: 'Expense',
  amount: 100,
  category: 'Miscellaneous',
  ...over,
})

// One table for every "what does the taxonomy say?" assertion. `capital_loss`
// here means DETECTION fires (a candidate to classify), not that an aggregate
// drops the row -- only a classified key does that. Cases are grouped by
// intent; add a row here rather than a new it() block.
const CASES: ReadonlyArray<[label: string, row: ExpenseClassifiable, expected: ExpenseClass]> = [
  // --- realised capital losses ---
  [
    'stock market loss',
    tx({ category: 'Investment Expenses', subcategory: 'Stocks Market Loss' }),
    'capital_loss',
  ],
  ['F&O loss', tx({ category: 'Investment Expenses', subcategory: 'F&O Loss' }), 'capital_loss'],

  // --- genuine cost of investing: still an expense ---
  [
    'brokerage and other fees',
    tx({ category: 'Investment Expenses', subcategory: 'Brokerage & Other Fees' }),
    'investment_cost',
  ],
  [
    'financial advisor fees',
    tx({ category: 'Investment Expenses', subcategory: 'Financial Advisor Fees' }),
    'investment_cost',
  ],
  ['STT on equity trade', tx({ category: 'Investment Expenses', subcategory: 'STT' }), 'investment_cost'],
  [
    'demat AMC charges',
    tx({ category: 'Investment Expenses', subcategory: 'Demat AMC Charges' }),
    'investment_cost',
  ],
  [
    'investment account row with no fee or loss signal',
    tx({ category: 'Investment Expenses', subcategory: 'Investment Account' }),
    'investment_cost',
  ],

  // --- ordinary consumption stays consumption ---
  ['groceries', tx({ category: 'Food & Dining', subcategory: 'Groceries' }), 'consumption'],
  ['rent', tx({ category: 'Housing', subcategory: 'Rent' }), 'consumption'],
  [
    'bank service charge',
    tx({ category: 'Miscellaneous', subcategory: 'Bank Fees/Service Charges' }),
    'consumption',
  ],
  // A rental agent's brokerage is consumption, not a cost of investing. An
  // earlier version treated bare "brokerage" as an investment signal and
  // mislabelled this as investment_cost.
  [
    'housing brokerage (rental agent)',
    tx({ category: 'Housing', subcategory: 'Housing Brokerage/Subscriptions' }),
    'consumption',
  ],

  // --- unknown subcategory must fail safe to an expense class ---
  ['unknown subcategory', tx({ category: 'Miscellaneous', subcategory: 'Zorbing Deposit' }), 'consumption'],
  ['uncategorised', tx({ category: 'Miscellaneous', subcategory: 'Uncategorised' }), 'consumption'],

  // --- "loss" without an investment taxonomy is NOT a capital loss ---
  [
    'lost card replacement fee',
    tx({ category: 'Miscellaneous', subcategory: 'Card Loss Replacement' }),
    'consumption',
  ],
  ['loss of wallet', tx({ category: 'Cash', subcategory: 'Loss of Wallet' }), 'consumption'],

  // --- case and spacing variants ---
  ['upper case', tx({ category: 'INVESTMENT EXPENSES', subcategory: 'STOCKS MARKET LOSS' }), 'capital_loss'],
  ['lower case', tx({ category: 'investment expenses', subcategory: 'stocks market loss' }), 'capital_loss'],
  [
    'padded and double-spaced',
    tx({ category: '  Investment   Expenses ', subcategory: '  F&O   Loss  ' }),
    'capital_loss',
  ],
  ['spaced ampersand', tx({ category: 'Trading', subcategory: 'F & O Loss' }), 'capital_loss'],
  ['"and" spelled out', tx({ category: 'Trading', subcategory: 'F and O Loss' }), 'capital_loss'],

  // --- plural / singular drift ---
  ['plural losses', tx({ category: 'Trading', subcategory: 'F&O Losses' }), 'capital_loss'],
  ['plural stock losses', tx({ category: 'Investments', subcategory: 'Stock Market Losses' }), 'capital_loss'],
  ['singular fee', tx({ category: 'Investments', subcategory: 'Brokerage Fee' }), 'investment_cost'],
  ['plural fees', tx({ category: 'Investments', subcategory: 'Brokerage Fees' }), 'investment_cost'],
  ['stockbroker charges (no other signal)', tx({ category: 'Stockbroker Charges' }), 'investment_cost'],

  // --- another user's taxonomy: no reliance on one ledger's spellings ---
  ['Trading Losses', tx({ category: 'Trading Losses' }), 'capital_loss'],
  ['Realised Capital Loss', tx({ category: 'Capital Gains', subcategory: 'Realised Loss' }), 'capital_loss'],
  ['equity write-off', tx({ category: 'Equity Portfolio', subcategory: 'Write-Off' }), 'capital_loss'],
  ['crypto loss', tx({ category: 'Crypto', subcategory: 'Realized Loss' }), 'capital_loss'],
  ['intraday speculative loss', tx({ category: 'Intraday', subcategory: 'Speculative Loss' }), 'capital_loss'],

  // --- fee signal must beat loss signal on the same row (fail safe) ---
  [
    'brokerage charged on a loss-making trade',
    tx({ category: 'Investment Expenses', subcategory: 'F&O Loss Brokerage Fees' }),
    'investment_cost',
  ],

  // --- empty / missing text ---
  ['no category at all', { type: 'Expense', amount: 10 }, 'consumption'],
  ['empty strings', tx({ category: '', subcategory: '' }), 'consumption'],
  ['null fields', tx({ category: null, subcategory: null }), 'consumption'],
  ['undefined fields', tx({ category: undefined, subcategory: undefined }), 'consumption'],
]

/** The old table's `capital_loss` label now means "detection fires", nothing more. */
const detected = (expected: ExpenseClass) => expected === 'capital_loss'

/** Without a classified key a detected loss is still spending: a cost of investing. */
const unclassified = (expected: ExpenseClass): ExpenseClass =>
  expected === 'capital_loss' ? 'investment_cost' : expected

const keyOf = (row: ExpenseClassifiable) => `${row.category ?? ''}::${row.subcategory ?? ''}`

describe('looksLikeCapitalLoss (detection only)', () => {
  it.each(CASES)('detects %s', (_label, row, expected) => {
    expect(looksLikeCapitalLoss(row)).toBe(detected(expected))
  })

  it('never fires for a row with no investment signal', () => {
    const nonInvestment = CASES.filter(
      ([, row]) =>
        !/invest|stock|trad|f\s*&|crypto|equity|capital|intraday|mf/i.test(
          `${row.category ?? ''} ${row.subcategory ?? ''}`,
        ),
    )
    expect(nonInvestment.length).toBeGreaterThan(0)
    for (const [, row] of nonInvestment) {
      expect(looksLikeCapitalLoss(row)).toBe(false)
    }
  })
})

describe('classifyExpense with nothing classified (the shipped state)', () => {
  it.each(CASES)('classifies %s as spending', (_label, row, expected) => {
    expect(classifyExpense(row)).toBe(unclassified(expected))
    expect(isSpending(row)).toBe(true)
  })

  it('never returns capital_loss, however loud the name is', () => {
    for (const [, row] of CASES) {
      expect(classifyExpense(row)).not.toBe('capital_loss')
      expect(classifyExpense(row, capitalLossConfig([]))).not.toBe('capital_loss')
    }
  })
})

// Regression guard for the false-positive class the taxonomy-only window fixes:
// free text used to be read in the same context window as the investment
// signal, so a consumption row whose note said "loss" and whose account was a
// broker account was flagged as a realised loss.
describe('free-text note and account are never read', () => {
  const withFreeText = (
    row: ExpenseClassifiable,
    note: string,
    account: string,
  ): ExpenseClassifiable => ({ ...row, ...({ note, account } as Record<string, string>) })

  const freeTextCases: ReadonlyArray<[string, ExpenseClassifiable, string, string]> = [
    [
      'gadget replacing a lost item, paid from a mutual-fund-linked account',
      tx({ category: 'Gadgets', subcategory: 'Audio' }),
      'replacement for loss',
      'Mutual Funds: Broker',
    ],
    [
      'auto fare whose note mentions a PF office and a lost wallet',
      tx({ category: 'Transport', subcategory: 'Auto' }),
      'trip to PF office, loss of wallet',
      'Cash',
    ],
    [
      'rent whose note mentions an equity redemption and a lost receipt',
      tx({ category: 'Housing', subcategory: 'Rent' }),
      'paid after equity redemption; loss of receipt',
      'Bank: Main',
    ],
  ]

  it.each(freeTextCases)('never suggests %s', (_label, row, note, account) => {
    const noisy = withFreeText(row, note, account)
    expect(looksLikeCapitalLoss(noisy)).toBe(false)
    expect(classifyExpense(noisy)).toBe('consumption')
    expect(isSpending(noisy)).toBe(true)
  })

  it('does not let a note alone raise the signal', () => {
    const row = withFreeText(tx({ category: 'Gifts', subcategory: 'Wedding' }), 'F&O loss', 'Stocks: Broker')
    expect(looksLikeCapitalLoss(row)).toBe(false)
  })

  it('still detects a loss when the taxonomy itself says so', () => {
    const row = withFreeText(
      tx({ category: 'Investment Expenses', subcategory: 'Stocks Market Loss' }),
      'quarterly settlement',
      'Stocks: Broker',
    )
    expect(looksLikeCapitalLoss(row)).toBe(true)
  })
})

describe('classified keys (capital_loss_categories)', () => {
  const loss = tx({ category: 'Investment Expenses', subcategory: 'F&O Loss' })
  const brokerage = tx({ category: 'Investment Expenses', subcategory: 'Brokerage & Other Fees' })

  it('excludes exactly the classified Category::Subcategory', () => {
    const config = capitalLossConfig(['Investment Expenses::F&O Loss'])
    expect(classifyExpense(loss, config)).toBe('capital_loss')
    expect(isCapitalLoss(loss, config)).toBe(true)
    expect(isSpending(loss, config)).toBe(false)
    // A sibling subcategory of the same category stays spending.
    expect(isSpending(brokerage, config)).toBe(true)
  })

  it('classifies every detected loss in the table once its key is saved', () => {
    const lossRows = CASES.filter(([, , expected]) => detected(expected)).map(([, row]) => row)
    expect(lossRows.length).toBeGreaterThan(5)
    for (const row of lossRows) {
      expect(classifyExpense(row, capitalLossConfig([keyOf(row)]))).toBe('capital_loss')
    }
  })

  it('normalises like the backend: trim and lower-case each half, nothing more', () => {
    const config = capitalLossConfig(['  INVESTMENT EXPENSES ::  f&o loss  '])
    expect(isCapitalLoss(loss, config)).toBe(true)
    // Inner whitespace is NOT collapsed (backend `_norm` cannot do that in SQL),
    // so a double-spaced key must not match the single-spaced row.
    expect(isCapitalLoss(loss, capitalLossConfig(['Investment  Expenses::F&O Loss']))).toBe(false)
  })

  it('honours a user classification the patterns would never suggest', () => {
    const groceries = tx({ category: 'Food & Dining', subcategory: 'Groceries' })
    expect(looksLikeCapitalLoss(groceries)).toBe(false)
    expect(classifyExpense(groceries, capitalLossConfig(['Food & Dining::Groceries']))).toBe(
      'capital_loss',
    )
  })

  it('matches a separator-less key only on rows without a subcategory', () => {
    const config = capitalLossConfig(['Trading Losses'])
    expect(isCapitalLoss(tx({ category: 'Trading Losses' }), config)).toBe(true)
    expect(isCapitalLoss(tx({ category: 'Trading Losses', subcategory: 'Intraday' }), config)).toBe(false)
  })

  it('skips blank and non-string entries', () => {
    expect([...capitalLossKeySet(['', '   ', 7, null, 'A::B'])]).toEqual(['a::b'])
    expect(capitalLossKeySet(null).size).toBe(0)
    expect(capitalLossKeySet(undefined).size).toBe(0)
  })

  it('builds the same key string the backend `classification_key` does', () => {
    expect(classificationKey(' Investment Expenses ', 'F&O Loss')).toBe('investment expenses::f&o loss')
    expect(classificationKey(null, undefined)).toBe('::')
  })
})

describe('splitExpenseTotals', () => {
  // Synthetic fixture with round numbers so the arithmetic is readable and no
  // real ledger figure is committed.
  const ledger: ExpenseClassifiable[] = [
    { type: 'Expense', amount: 30000, category: 'Investment Expenses', subcategory: 'Stocks Market Loss' },
    { type: 'Expense', amount: 20000, category: 'Investment Expenses', subcategory: 'F&O Loss' },
    { type: 'Expense', amount: 4000, category: 'Investment Expenses', subcategory: 'Brokerage & Other Fees' },
    { type: 'Expense', amount: 1000, category: 'Investment Expenses', subcategory: 'Financial Advisor Fees' },
    { type: 'Expense', amount: 45000, category: 'Food & Dining', subcategory: 'Groceries' },
  ]
  const classified = capitalLossConfig([
    'Investment Expenses::Stocks Market Loss',
    'Investment Expenses::F&O Loss',
  ])

  it('splits rows into the three buckets once the losses are classified', () => {
    const totals = splitExpenseTotals(ledger, classified)
    expect(totals.capitalLoss).toBe(50000)
    expect(totals.investmentCost).toBe(5000)
    expect(totals.consumption).toBe(45000)
    expect(totals.total).toBe(100000)
    expect(totals.spending).toBe(50000)
  })

  it('counts every row as spending while nothing is classified', () => {
    const totals = splitExpenseTotals(ledger)
    expect(totals.capitalLoss).toBe(0)
    expect(totals.investmentCost).toBe(55000)
    expect(totals.spending).toBe(100000)
    expect(totals.total).toBe(100000)
  })

  it('keeps spending plus capital loss equal to the unfiltered total', () => {
    const totals = splitExpenseTotals(ledger, classified)
    expect(totals.consumption + totals.investmentCost).toBe(totals.spending)
    expect(totals.spending + totals.capitalLoss).toBe(totals.total)
  })

  it('ignores non-expense rows', () => {
    const totals = splitExpenseTotals([
      { type: 'Income', amount: 5000, category: 'Employment Income', subcategory: 'Salary' },
      { type: 'Transfer', amount: 9000, category: 'Transfer: Bank: A -> Bank: B' },
      { type: 'Expense', amount: 250, category: 'Food & Dining' },
    ])
    expect(totals.total).toBe(250)
    expect(totals.consumption).toBe(250)
  })

  it('uses absolute amounts and skips non-finite ones', () => {
    const totals = splitExpenseTotals([
      { type: 'Expense', amount: -400, category: 'Food & Dining' },
      { type: 'Expense', amount: Number.NaN, category: 'Food & Dining' },
      { type: 'Expense', amount: Number.POSITIVE_INFINITY, category: 'Food & Dining' },
      { type: 'Expense', category: 'Food & Dining' },
    ])
    expect(totals.total).toBe(400)
    expect(totals.consumption).toBe(400)
  })

  it('returns zeroes for empty, null and undefined input', () => {
    for (const input of [[], null, undefined]) {
      const totals = splitExpenseTotals(input)
      expect(totals).toEqual({
        consumption: 0,
        investmentCost: 0,
        capitalLoss: 0,
        spending: 0,
        total: 0,
      })
    }
  })
})
