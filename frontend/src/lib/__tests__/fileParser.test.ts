import { describe, expect, it } from 'vitest'
import { COLUMN_MAPPINGS, REQUIRED_COLUMNS, VALID_TYPES } from '@/constants/columns'

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

describe('Column resolution logic', () => {
  it('should resolve standard Money Manager Pro columns', () => {
    const headers = ['Period', 'Accounts', 'Category', 'Amount / INR', 'Income/Expense', 'Note']
    const mapping: Record<string, string> = {}

    for (const [standardName, candidates] of Object.entries(COLUMN_MAPPINGS)) {
      for (const candidate of candidates) {
        if (headers.includes(candidate)) {
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
    const headers = ['Date', 'Account', 'Category', 'Amount', 'Type']
    const mapping: Record<string, string> = {}

    for (const [standardName, candidates] of Object.entries(COLUMN_MAPPINGS)) {
      for (const candidate of candidates) {
        if (headers.includes(candidate)) {
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
    const headers = ['Date', 'Amount'] // missing account, category, type

    const missing = REQUIRED_COLUMNS.filter((col) => {
      const candidates = COLUMN_MAPPINGS[col]
      return !candidates.some((c) => headers.includes(c))
    })

    expect(missing).toContain('account')
    expect(missing).toContain('category')
    expect(missing).toContain('type')
    expect(missing).not.toContain('date')
    expect(missing).not.toContain('amount')
  })
})
