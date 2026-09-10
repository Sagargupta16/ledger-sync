import { beforeEach, describe, expect, it } from 'vitest'

import {
  acknowledgeGoalRecovery,
  getLegacyGoalRecovery,
  LEGACY_GOAL_STORAGE_KEYS as KEYS,
  readLegacyGoalData,
} from '../legacyGoalRecovery'
import { makeRecoveryGoal } from './goalRecoveryFixtures'

beforeEach(() => localStorage.clear())

describe('legacy goal recovery records', () => {
  it('offers only validated changes for IDs returned by the account query', () => {
    localStorage.setItem(KEYS.allocations, JSON.stringify({ 101: 75_000, 999: 90_000 }))
    localStorage.setItem(KEYS.overrides, JSON.stringify({
      101: { name: 'Updated fund', target_amount: 200_000, target_date: '2028-02-29' },
      999: { name: 'Other account', target_amount: 100, target_date: '2027-01-01' },
    }))
    localStorage.setItem(KEYS.hidden, JSON.stringify([101, 999]))

    const items = getLegacyGoalRecovery([makeRecoveryGoal()], 71, readLegacyGoalData())

    expect(items).toHaveLength(1)
    expect(items[0].goal.id).toBe(101)
    expect(items[0].changes.map(({ field, value }) => [field, value])).toEqual([
      ['current_amount', 75_000], ['name', 'Updated fund'],
      ['target_amount', 200_000], ['target_date', '2028-02-29'],
    ])
    expect(items[0].hidden).toBe(true)
  })

  it.each([-1, '75000', null, 0.001, 10_000_000_000_000])('rejects invalid allocation %s', (value) => {
    localStorage.setItem(KEYS.allocations, JSON.stringify({ 101: value }))

    expect(getLegacyGoalRecovery([makeRecoveryGoal()], 71, readLegacyGoalData())).toEqual([])
  })

  it.each([
    { name: '', target_amount: 100, target_date: '2027-01-01' },
    { name: 'Fund', target_amount: 0, target_date: '2027-01-01' },
    { name: 'Fund', target_amount: 100, target_date: '2027-02-29' },
    { name: 'Fund', target_amount: 100, target_date: '2027-13-01' },
    { name: 'Fund', target_amount: 100, target_date: '2027-01-32' },
    { name: 'Fund', target_amount: 100, target_date: '' },
    { name: 'Fund', target_amount: 100 },
    [],
  ])('rejects malformed detail record %# without losing valid progress', (override) => {
    localStorage.setItem(KEYS.overrides, JSON.stringify({ 101: override }))
    localStorage.setItem(KEYS.allocations, JSON.stringify({ 101: 0 }))

    const items = getLegacyGoalRecovery([makeRecoveryGoal({ current_amount: 10 })], 71, readLegacyGoalData())

    expect(items[0].changes.map(({ field }) => field)).toEqual(['current_amount'])
  })

  it('leaves malformed JSON intact and ignores string or nonpositive hidden IDs', () => {
    localStorage.setItem(KEYS.overrides, '{broken')
    localStorage.setItem(KEYS.allocations, '[]')
    localStorage.setItem(KEYS.hidden, '["101", -1, null]')

    expect(getLegacyGoalRecovery([makeRecoveryGoal()], 71, readLegacyGoalData())).toEqual([])
    expect(localStorage.getItem(KEYS.overrides)).toBe('{broken')
  })

  it('acknowledges only the chosen fields for this account without rewriting any legacy key', () => {
    const allocations = '{"101":75000,"999":90000}'
    const overrides = '{"101":{"name":"Updated fund","target_amount":200000,"target_date":"2027-01-01"}}'
    localStorage.setItem(KEYS.allocations, allocations)
    localStorage.setItem(KEYS.overrides, overrides)
    localStorage.setItem(KEYS.hidden, '[101,999]')
    const [item] = getLegacyGoalRecovery([makeRecoveryGoal()], 71, readLegacyGoalData())
    const allocation = item.changes.filter(({ field }) => field === 'current_amount')

    expect(acknowledgeGoalRecovery(71, item, allocation, false)).toBe(true)

    const [remaining] = getLegacyGoalRecovery([makeRecoveryGoal()], 71, readLegacyGoalData())
    expect(remaining.changes.map(({ field }) => field)).toEqual(['name', 'target_amount'])
    expect(remaining.hidden).toBe(true)
    expect(getLegacyGoalRecovery([makeRecoveryGoal()], 72, readLegacyGoalData())[0].changes).toHaveLength(3)
    expect(localStorage.getItem(KEYS.allocations)).toBe(allocations)
    expect(localStorage.getItem(KEYS.overrides)).toBe(overrides)
    expect(localStorage.getItem(KEYS.hidden)).toBe('[101,999]')
  })

  it('does not acknowledge a newer browser value when an older write completes', () => {
    localStorage.setItem(KEYS.allocations, '{"101":75000,"999":90000}')
    const [reviewed] = getLegacyGoalRecovery([makeRecoveryGoal()], 71, readLegacyGoalData())
    const newer = '{"101":85000,"999":95000,"777":12000}'
    localStorage.setItem(KEYS.allocations, newer)

    acknowledgeGoalRecovery(71, reviewed, reviewed.changes, false)

    expect(localStorage.getItem(KEYS.allocations)).toBe(newer)
    expect(getLegacyGoalRecovery([makeRecoveryGoal()], 71, readLegacyGoalData())[0].changes[0].value).toBe(85_000)
    expect(localStorage.getItem('ledger-sync-goal-recovery:71:101:current_amount')).toBeNull()
  })
})
