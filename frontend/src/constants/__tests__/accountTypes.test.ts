import { describe, it, expect } from 'vitest'
import { inferAccountType, isInvestmentAccount } from '../accountTypes'

describe('inferAccountType', () => {
  describe('credit cards take priority over bank-name tokens', () => {
    it.each([
      ['HDFC CC', 'credit_card'],
      ['HDFC Credit Card', 'credit_card'],
      ['ICICI Visa', 'credit_card'],
      ['Axis Amex', 'credit_card'],
      ['SBI MasterCard', 'credit_card'],
      ['Rupay Credit', 'credit_card'],
      ['Diners Club', 'credit_card'],
    ])('classifies %s as %s', (name, expected) => {
      expect(inferAccountType(name)).toBe(expected)
    })
  })

  describe('investment accounts', () => {
    it.each([
      ['HDFC Stocks', 'investment'],
      ['Zerodha Demat', 'investment'],
      ['Groww MF', 'investment'],
      ['DEMAT Account', 'investment'],
      ['My PPF', 'investment'],
      ['EPF Balance', 'investment'],
      ['NPS Tier-I', 'investment'],
      ['Ind Money Stocks', 'investment'],
      ['Company RSUs', 'investment'],
      ['ESPP Account', 'investment'],
      ['Smallcase Portfolio', 'investment'],
      ['Mutual Fund Folio', 'investment'],
    ])('classifies %s as %s', (name, expected) => {
      expect(inferAccountType(name)).toBe(expected)
    })
  })

  describe('bank / deposit accounts', () => {
    it.each([
      ['HDFC Bank', 'deposit'],
      ['SBI Savings', 'deposit'],
      ['ICICI Current', 'deposit'],
      ['Axis FD', 'deposit'],
      ['Kotak RD', 'deposit'],
      ['Yes Bank Savings', 'deposit'],
      ['Paytm Wallet', 'deposit'],
      ['Cash', 'deposit'],
    ])('classifies %s as %s', (name, expected) => {
      expect(inferAccountType(name)).toBe(expected)
    })
  })

  describe('loans', () => {
    it.each([
      ['Home Loan', 'loan'],
      ['HDFC Personal Loan', 'loan'],
      ['Car Loan EMI', 'loan'],
      ['Education Loan', 'loan'],
      ['Gold Loan', 'loan'],
    ])('classifies %s as %s', (name, expected) => {
      expect(inferAccountType(name)).toBe(expected)
    })
  })

  describe('ambiguous names resolve by priority', () => {
    it('HDFC Credit Card Loan -> credit_card (CC wins over loan)', () => {
      expect(inferAccountType('HDFC Credit Card Loan')).toBe('credit_card')
    })
    it('ICICI Investment Account -> investment (investment wins over bank)', () => {
      expect(inferAccountType('ICICI Investment Account')).toBe('investment')
    })
    it('Zerodha Investment CC -> credit_card (CC wins over investment)', () => {
      // If someone labels a credit card "Zerodha Investment CC", CC wins.
      expect(inferAccountType('Zerodha Investment CC')).toBe('credit_card')
    })
  })

  describe('word boundaries prevent substring collisions', () => {
    it('does not match "invest" inside "investigation"', () => {
      expect(inferAccountType('Under Investigation')).toBe(null)
    })
    it('does not match "rd" inside "credit card"', () => {
      // "HDFC Credit Card" should be credit_card, not deposit (rd)
      expect(inferAccountType('HDFC Credit Card')).toBe('credit_card')
    })
  })

  describe('edge cases', () => {
    it('returns null for empty input', () => {
      expect(inferAccountType('')).toBe(null)
      expect(inferAccountType('   ')).toBe(null)
    })
    it('returns null for unrecognized names', () => {
      expect(inferAccountType('Random Label 123')).toBe(null)
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
