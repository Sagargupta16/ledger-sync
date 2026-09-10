import { describe, expect, it } from 'vitest'

import {
  buildCreditCardAccount,
  getCreditCardUtilizationStatus,
  summarizeCreditCards,
} from '../creditCardUtilization'

describe('buildCreditCardAccount', () => {
  it('turns a negative ledger balance into positive outstanding debt', () => {
    expect(buildCreditCardAccount('Daily card', -2500, 10_000)).toEqual({
      name: 'Daily card',
      balance: 2500,
      creditLimit: 10_000,
      utilization: 25,
      availableCredit: 7500,
      status: 'low',
    })
  })

  it('does not count a prepaid asset as outstanding debt', () => {
    expect(buildCreditCardAccount('Prepaid card', 2500, 10_000)).toEqual({
      name: 'Prepaid card',
      balance: 0,
      creditLimit: 10_000,
      utilization: 0,
      availableCredit: 10_000,
      status: 'low',
    })
  })

  it.each([0, -0])('keeps a cleared balance at positive zero (%s)', (balance) => {
    expect(buildCreditCardAccount('Cleared card', balance, 1000).balance).toBe(0)
  })

  it.each([undefined, Number.NaN, Infinity, -1])(
    'suppresses utilization for an unusable limit (%s)',
    (limit) => {
      expect(buildCreditCardAccount('Unconfigured card', -500, limit)).toEqual({
        name: 'Unconfigured card',
        balance: 500,
        creditLimit: null,
        utilization: null,
        availableCredit: null,
        status: 'unknown',
      })
    },
  )

  it('preserves a deliberately configured zero limit', () => {
    expect(buildCreditCardAccount('Blocked card', -500, 0)).toMatchObject({
      balance: 500,
      creditLimit: 0,
      utilization: null,
      availableCredit: null,
      status: 'unknown',
    })
  })

  it('does not treat a prepaid card without a limit as measured', () => {
    expect(buildCreditCardAccount('Prepaid card', 500)).toMatchObject({
      balance: 0,
      creditLimit: null,
      utilization: null,
      availableCredit: null,
      status: 'unknown',
    })
  })

  it.each([Number.NaN, Infinity, -Infinity])(
    'does not infer debt or headroom from a nonfinite balance (%s)',
    (balance) => {
      expect(buildCreditCardAccount('Unavailable card', balance, 1000)).toMatchObject({
        balance: null,
        creditLimit: 1000,
        utilization: null,
        availableCredit: null,
        status: 'unknown',
      })
    },
  )

  it('keeps over-limit utilization while clamping available credit at zero', () => {
    expect(buildCreditCardAccount('Over limit', -12_000, 10_000)).toMatchObject({
      balance: 12_000,
      utilization: 120,
      availableCredit: 0,
      status: 'critical',
    })
  })
})

describe('getCreditCardUtilizationStatus', () => {
  it.each([
    [0, 'low'],
    [30, 'low'],
    [30.01, 'medium'],
    [50, 'medium'],
    [50.01, 'high'],
    [75, 'high'],
    [75.01, 'critical'],
  ] as const)('preserves the strict threshold at %s percent', (utilization, status) => {
    expect(getCreditCardUtilizationStatus(utilization)).toBe(status)
  })
})

describe('summarizeCreditCards', () => {
  it('uses the measured subset without adding or netting prepaid assets into debt', () => {
    const owing = buildCreditCardAccount('Owing card', -6000, 10_000)
    const prepaid = buildCreditCardAccount('Prepaid card', 2000, 10_000)
    const cards = [
      owing,
      prepaid,
      buildCreditCardAccount('No limit', -4000),
      buildCreditCardAccount('Blocked', -500, 0),
      buildCreditCardAccount('Unavailable', Number.NaN, 10_000),
    ]

    expect(summarizeCreditCards(cards)).toEqual({
      measured: [owing, prepaid],
      unmeasuredCount: 3,
      gap: { noLimit: 1, zeroLimit: 1, unavailable: 1 },
      totalBalance: 10_500,
      measuredBalance: 6000,
      measuredLimit: 20_000,
      overallUtilization: 30,
      isElevated: false,
    })
  })

  it('retains known debt but no ratio when no card has a usable limit', () => {
    expect(summarizeCreditCards([
      buildCreditCardAccount('No limit', -4000),
      buildCreditCardAccount('Blocked', -500, 0),
    ])).toMatchObject({
      measured: [],
      totalBalance: 4500,
      measuredBalance: 0,
      measuredLimit: 0,
      overallUtilization: null,
      isElevated: false,
    })
  })

  it('has no invented utilization for an empty set', () => {
    expect(summarizeCreditCards([])).toEqual({
      measured: [],
      unmeasuredCount: 0,
      gap: { noLimit: 0, zeroLimit: 0, unavailable: 0 },
      totalBalance: 0,
      measuredBalance: 0,
      measuredLimit: 0,
      overallUtilization: null,
      isElevated: false,
    })
  })

  it.each([
    [-5000, false],
    [-5001, true],
  ] as const)('retains the aggregate warning threshold for debt %s', (balance, isElevated) => {
    expect(summarizeCreditCards([
      buildCreditCardAccount('Measured card', balance, 10_000),
    ]).isElevated).toBe(isElevated)
  })
})
