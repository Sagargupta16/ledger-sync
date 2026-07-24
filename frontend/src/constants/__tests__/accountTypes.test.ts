import { describe, it, expect } from 'vitest'
import { inferAccountType, isInvestmentAccount, type AccountType } from '../accountTypes'

// Single classification table keeps all the "does input X produce type Y?"
// assertions in one place and avoids repeating the same `it.each` +
// expect-body for each type bucket. Add a row here when a new pattern
// needs coverage.
const CLASSIFICATION_CASES: ReadonlyArray<[input: string, expected: AccountType, bucket: string]> = [
  // Credit cards take priority over bank-name tokens
  ['HDFC CC', 'credit_card', 'credit_card'],
  ['HDFC Credit Card', 'credit_card', 'credit_card'],
  ['ICICI Visa', 'credit_card', 'credit_card'],
  ['Axis Amex', 'credit_card', 'credit_card'],
  ['SBI MasterCard', 'credit_card', 'credit_card'],
  ['Rupay Credit', 'credit_card', 'credit_card'],
  ['Diners Club', 'credit_card', 'credit_card'],
  // Investments
  ['HDFC Stocks', 'investment', 'investment'],
  ['Zerodha Demat', 'investment', 'investment'],
  ['Groww MF', 'investment', 'investment'],
  ['DEMAT Account', 'investment', 'investment'],
  ['My PPF', 'investment', 'investment'],
  ['EPF Balance', 'investment', 'investment'],
  ['NPS Tier-I', 'investment', 'investment'],
  ['Ind Money Stocks', 'investment', 'investment'],
  ['Company RSUs', 'investment', 'investment'],
  ['ESPP Account', 'investment', 'investment'],
  ['Smallcase Portfolio', 'investment', 'investment'],
  ['Mutual Fund Folio', 'investment', 'investment'],
  // Bank / deposit
  ['HDFC Bank', 'deposit', 'deposit'],
  ['SBI Savings', 'deposit', 'deposit'],
  ['ICICI Current', 'deposit', 'deposit'],
  ['Axis FD', 'deposit', 'deposit'],
  ['Kotak RD', 'deposit', 'deposit'],
  ['Yes Bank Savings', 'deposit', 'deposit'],
  ['Paytm Wallet', 'deposit', 'deposit'],
  ['Cash', 'deposit', 'deposit'],
  // Loans
  ['Home Loan', 'loan', 'loan'],
  ['HDFC Personal Loan', 'loan', 'loan'],
  ['Car Loan EMI', 'loan', 'loan'],
  ['Education Loan', 'loan', 'loan'],
  ['Gold Loan', 'loan', 'loan'],
]

describe('inferAccountType', () => {
  it.each(CLASSIFICATION_CASES)('classifies %s as %s (bucket: %s)', (input, expected) => {
    expect(inferAccountType(input)).toBe(expected)
  })

  describe('ambiguous names resolve by priority', () => {
    it('HDFC Credit Card Loan -> credit_card (CC wins over loan)', () => {
      expect(inferAccountType('HDFC Credit Card Loan')).toBe('credit_card')
    })
    it('ICICI Investment Account -> investment (investment wins over bank)', () => {
      expect(inferAccountType('ICICI Investment Account')).toBe('investment')
    })
    it('Zerodha Investment CC -> credit_card (CC wins over investment)', () => {
      expect(inferAccountType('Zerodha Investment CC')).toBe('credit_card')
    })
  })

  describe('word boundaries prevent substring collisions', () => {
    it('does not match "invest" inside "investigation"', () => {
      expect(inferAccountType('Under Investigation')).toBeNull()
    })
    it('"HDFC Credit Card" wins for credit_card, not deposit via "rd"', () => {
      expect(inferAccountType('HDFC Credit Card')).toBe('credit_card')
    })
  })

  describe('edge cases', () => {
    it('returns null for empty or whitespace-only input', () => {
      expect(inferAccountType('')).toBeNull()
      expect(inferAccountType('   ')).toBeNull()
    })
    it('returns null for unrecognized names', () => {
      expect(inferAccountType('Random Label 123')).toBeNull()
    })
    it('is case insensitive', () => {
      expect(inferAccountType('hdfc cc')).toBe('credit_card')
      expect(inferAccountType('ZERODHA DEMAT')).toBe('investment')
    })
  })
})

describe('isInvestmentAccount', () => {
  it('returns true only when the top-priority classifier is investment', () => {
    expect(isInvestmentAccount('Zerodha Demat')).toBe(true)
    expect(isInvestmentAccount('HDFC CC')).toBe(false) // credit card wins
    expect(isInvestmentAccount('HDFC Bank')).toBe(false)
    expect(isInvestmentAccount('Home Loan')).toBe(false)
  })
})
