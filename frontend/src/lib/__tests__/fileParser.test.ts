import { describe, expect, it } from 'vitest'
import { COLUMN_MAPPINGS, REQUIRED_COLUMNS, VALID_TYPES } from '@/constants/columns'
import { parseAmount, parseDate, parseFile } from '@/lib/fileParser'

/**
 * Tests for the fileParser module's helper logic.
 *
 * We test the column mapping resolution, date parsing, amount parsing,
 * and type validation logic by importing the constants and testing the
 * same logic the parser uses.
 *
 * Full integration tests (File -> SheetJS -> parseFile) require a real
 * XLSX buffer which needs SheetJS to generate, so we test the pure
 * functions and constants here.
 */

describe('Column constants', () => {
  it('should have all required columns defined in COLUMN_MAPPINGS', () => {
    for (const col of REQUIRED_COLUMNS) {
      expect(COLUMN_MAPPINGS[col]).toBeDefined()
      expect(COLUMN_MAPPINGS[col].length).toBeGreaterThan(0)
    }
  })

  it('should include flexible date column names', () => {
    expect(COLUMN_MAPPINGS.date).toContain('Period')
    expect(COLUMN_MAPPINGS.date).toContain('Date')
    expect(COLUMN_MAPPINGS.date).toContain('date')
  })

  it('should include flexible amount column names', () => {
    expect(COLUMN_MAPPINGS.amount).toContain('Amount / INR')
    expect(COLUMN_MAPPINGS.amount).toContain('Amount')
  })

  it('should include flexible type column names', () => {
    expect(COLUMN_MAPPINGS.type).toContain('Income/Expense')
    expect(COLUMN_MAPPINGS.type).toContain('Type')
  })
})

describe('Valid transaction types', () => {
  it('should accept standard types (case-insensitive)', () => {
    expect(VALID_TYPES.has('income')).toBe(true)
    expect(VALID_TYPES.has('expense')).toBe(true)
    expect(VALID_TYPES.has('transfer-in')).toBe(true)
    expect(VALID_TYPES.has('transfer-out')).toBe(true)
  })

  it('should accept Money Manager Pro short types', () => {
    expect(VALID_TYPES.has('exp.')).toBe(true)
  })

  it('should accept space-separated transfer variants', () => {
    expect(VALID_TYPES.has('transfer in')).toBe(true)
    expect(VALID_TYPES.has('transfer out')).toBe(true)
  })

  it('should reject unknown types', () => {
    expect(VALID_TYPES.has('refund')).toBe(false)
    expect(VALID_TYPES.has('credit')).toBe(false)
  })
})

describe('parseDate (timezone-stable)', () => {
  it('returns an ISO date verbatim (no timezone shift)', () => {
    expect(parseDate('2024-04-01', 1)).toBe('2024-04-01')
  })

  it('takes the date part of an ISO datetime', () => {
    expect(parseDate('2024-01-15 00:00:00', 1)).toBe('2024-01-15')
  })

  it('reads numeric slash dates as DD/MM/YYYY (India convention)', () => {
    expect(parseDate('05/06/2024', 1)).toBe('2024-06-05')
  })

  it('reads numeric dash dates as DD-MM-YYYY', () => {
    expect(parseDate('01-04-2024', 1)).toBe('2024-04-01')
  })

  it('parses text-month dates without shifting the day', () => {
    expect(parseDate('15-Mar-2024', 1)).toBe('2024-03-15')
  })

  it('parses an Excel serial number via the UTC epoch', () => {
    // Serial 45383 = 2024-04-01.
    expect(parseDate(45383, 1)).toBe('2024-04-01')
  })

  it('throws on an unparseable date', () => {
    expect(() => parseDate('not-a-date', 7)).toThrow(/Row 7/)
  })

  it.each([
    '2026-02-30', '31/04/2026', '29-Feb-2025', 'Feb 31 2026',
    '2026-01-15garbage', '2026-01-15 25:00:00', Infinity, NaN,
  ])('rejects invalid dates without rolling them forward: %s', (value) => {
    expect(() => parseDate(value, 3)).toThrow(/Row 3/)
  })

  it('accepts a real leap day', () => {
    expect(parseDate('29/02/2024', 3)).toBe('2024-02-29')
  })
})

describe('parseAmount', () => {
  it.each([
    ['1.005', 1.01],
    ['10.075', 10.08],
    [2.675, 2.68],
    ['9.995', 10],
    ['-2.675', 2.68],
    ['1,00,000.25', 100000.25],
    ['1,000.25', 1000.25],
    ['1e3', 1000],
    ['0.004', 0],
  ])('rounds decimal source amounts half up: %s', (input, expected) => {
    expect(parseAmount(input, 2)).toBe(expected)
  })

  it.each(['100abc', '1,2', '1.2.3', Infinity, NaN, true, '1e99', ''])(
    'rejects malformed or unsupported amounts: %s', (value) => {
      expect(() => parseAmount(value, 4)).toThrow(/Row 4/)
    },
  )
})

function csvFile(lines: string[]): File {
  const contents = ['Date,Account,Category,Type,Amount,Currency', ...lines].join('\n')
  const buffer = new TextEncoder().encode(contents).buffer
  return Object.assign(new File([buffer], 'snapshot.csv', { type: 'text/csv' }), {
    arrayBuffer: () => Promise.resolve(buffer),
  })
}

describe('parseFile snapshot validation', () => {
  it.each([
    ['2026-02-30,Cash,Food,Expense,200,INR', /Row 3.*calendar/],
    ['2026-01-16,Cash,Food,Expense,100abc,INR', /Row 3.*complete number/],
    ['2026-01-16,Cash,Food,Expense,100,USD', /Row 3.*INR/],
    ['2026-01-16,,Food,Expense,100,INR', /Row 3.*Account/],
  ])('rejects the entire CSV when a row is invalid', async (invalidRow, expected) => {
    const file = csvFile(['2026-01-15,Cash,Food,Expense,100,INR', invalidRow])
    await expect(parseFile(file)).rejects.toThrow(expected)
  })

  it('returns valid CSV rows with exact cent rounding', async () => {
    const result = await parseFile(csvFile(['2026-01-15,Cash,Food,Expense,10.075,INR']))
    expect(result.rows).toHaveLength(1)
    expect(result.rows[0].amount).toBe(10.08)
    expect(result.fileHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('reports the source row after a blank line', async () => {
    const file = csvFile([
      '2026-01-15,Cash,Food,Expense,100,INR', '',
      '2026-02-30,Cash,Food,Expense,200,INR',
    ])
    await expect(parseFile(file)).rejects.toThrow(/Row 4/)
  })
})

describe('Column resolution logic', () => {
  it('should resolve standard Money Manager Pro columns', () => {
    const headers = new Set(['Period', 'Accounts', 'Category', 'Amount / INR', 'Income/Expense', 'Note'])
    const mapping: Record<string, string> = {}

    for (const [standardName, candidates] of Object.entries(COLUMN_MAPPINGS)) {
      for (const candidate of candidates) {
        if (headers.has(candidate)) {
          mapping[standardName] = candidate
          break
        }
      }
    }

    expect(mapping.date).toBe('Period')
    expect(mapping.account).toBe('Accounts')
    expect(mapping.category).toBe('Category')
    expect(mapping.amount).toBe('Amount / INR')
    expect(mapping.type).toBe('Income/Expense')
    expect(mapping.note).toBe('Note')
  })

  it('should resolve generic column names', () => {
    const headers = new Set(['Date', 'Account', 'Category', 'Amount', 'Type'])
    const mapping: Record<string, string> = {}

    for (const [standardName, candidates] of Object.entries(COLUMN_MAPPINGS)) {
      for (const candidate of candidates) {
        if (headers.has(candidate)) {
          mapping[standardName] = candidate
          break
        }
      }
    }

    expect(mapping.date).toBe('Date')
    expect(mapping.account).toBe('Account')
    expect(mapping.amount).toBe('Amount')
    expect(mapping.type).toBe('Type')
  })

  it('should detect missing required columns', () => {
    const headers = new Set(['Date', 'Amount']) // missing account, category, type

    const missing = REQUIRED_COLUMNS.filter((col) => {
      const candidates = COLUMN_MAPPINGS[col]
      return !candidates.some((c) => headers.has(c))
    })

    expect(missing).toContain('account')
    expect(missing).toContain('category')
    expect(missing).toContain('type')
    expect(missing).not.toContain('date')
    expect(missing).not.toContain('amount')
  })
})
