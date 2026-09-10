import { describe, expect, it } from 'vitest'

import type { Transaction } from '@/types'

import { classifyTransaction, createEmptyBucket } from '../healthScoreAnalysis'
import {
  checkIsInvestmentTransaction,
  checkIsInvestmentWithdrawal,
  healthInvestmentTransferDelta,
} from '../healthScoreTypes'

const isInvestment = (name: string) => ['Fund A', 'Fund B', 'Long term'].includes(name)

function transfer(from: string, to: string, amount: number, note = ''): Transaction {
  return {
    id: `${from}-${to}`, date: '2026-08-01', type: 'Transfer', category: 'Transfer',
    account: from, from_account: from, to_account: to, amount, note,
  }
}

describe('health investment transfer accounting', () => {
  it('nets new contributions and withdrawals without counting internal moves', () => {
    const bucket = createEmptyBucket()
    for (const tx of [
      transfer('Bank', 'Fund A', 10000),
      transfer('Fund A', 'Fund B', 10000),
      transfer('Fund B', 'Bank', 4000),
    ]) {
      classifyTransaction(tx, bucket, isInvestment)
    }
    expect(bucket.investmentInflow).toBe(10000)
    expect(bucket.investmentOutflow).toBe(4000)
    expect(bucket.investmentInflow - bucket.investmentOutflow).toBe(6000)
    expect(bucket.income).toBe(0)
    expect(bucket.expense).toBe(0)
  })

  it('preserves configured names and the existing unknown-destination fallback', () => {
    expect(healthInvestmentTransferDelta(transfer('Bank', 'Long term', 100), isInvestment)).toBe(100)
    expect(healthInvestmentTransferDelta(transfer('Bank', 'Unknown', 100, 'Monthly SIP'), isInvestment)).toBe(100)
    expect(healthInvestmentTransferDelta(transfer('Bank', 'PPF', 100), isInvestment)).toBe(100)
  })

  it('does not mistake an investment withdrawal note for an incoming contribution', () => {
    const tx = transfer('Fund A', 'Bank', 100, 'Investment withdrawal')
    expect(checkIsInvestmentTransaction(tx, isInvestment)).toBe(false)
    expect(checkIsInvestmentWithdrawal(tx, isInvestment)).toBe(true)
    expect(healthInvestmentTransferDelta(tx, isInvestment)).toBe(-100)
  })

  it('keeps compatibility predicates mutually exclusive for internal transfers', () => {
    const tx = transfer('Fund A', 'Fund B', 100)
    expect(checkIsInvestmentTransaction(tx, isInvestment)).toBe(false)
    expect(checkIsInvestmentWithdrawal(tx, isInvestment)).toBe(false)
  })
})
