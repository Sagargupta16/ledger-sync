import { describe, expect, it } from 'vitest'
import { isSpendingSplitValid, spendingSplitMessage, spendingSplitTotal } from '../spendingSplit'

const split = (needs: number, wants: number, savings: number) =>
  spendingSplitTotal({
    needs_target_percent: needs,
    wants_target_percent: wants,
    savings_target_percent: savings,
  })

describe('spending split rule (mirrors the backend 422)', () => {
  it.each([
    [50, 30, 20],
    [0, 0, 100],
    [33.33, 33.33, 33.34],
    [33.33, 33.33, 33.33],
  ])('accepts %s / %s / %s', (needs, wants, savings) => {
    expect(isSpendingSplitValid(split(needs, wants, savings))).toBe(true)
  })

  it.each([
    [50, 30, 15],
    [60, 30, 20],
    [33.33, 33.33, 33.32],
    [Number.NaN, 30, 20],
  ])('rejects %s / %s / %s', (needs, wants, savings) => {
    expect(isSpendingSplitValid(split(needs, wants, savings))).toBe(false)
  })

  it('states the current total without float noise', () => {
    expect(spendingSplitMessage(split(50, 30, 15))).toBe('Total 95% -- must be 100%')
    expect(spendingSplitMessage(split(33.33, 33.33, 33.32))).toBe('Total 99.98% -- must be 100%')
  })
})
