/**
 * Pins the Settings page's account-type vocabulary to the wire vocabulary.
 *
 * `ACCOUNT_TYPES` used to be a hand-copied `string[]` of the same six labels that
 * `ACCOUNT_TYPE_VALUES` already declares. Two copies of one vocabulary drift on
 * the next member: the dropdown keeps offering the old set while the API accepts
 * a new one, and nothing fails. These tests make the identity structural instead
 * of coincidental, so re-forking the list breaks the suite rather than the app.
 */

import { describe, expect, it } from 'vitest'

import { ACCOUNT_TYPE_VALUES } from '@/services/api/accountClassifications'
import { CATEGORY_COLORS, ACCOUNT_TYPES } from '../types'

describe('settings account-type vocabulary', () => {
  it('is the wire vocabulary, not a copy of it', () => {
    // Reference equality, not deep equality: a re-forked literal with identical
    // contents would pass `toEqual` and reintroduce exactly the drift risk.
    expect(ACCOUNT_TYPES).toBe(ACCOUNT_TYPE_VALUES)
  })

  it('is non-empty, so the dropdown can never render zero options', () => {
    expect(ACCOUNT_TYPES.length).toBeGreaterThan(0)
  })

  it('has a gradient for every account type the dropdown can render', () => {
    // `AccountClassificationsSection` reads CATEGORY_COLORS by account-type key
    // when painting each card. A member added upstream with no colour here
    // renders an unstyled card, which is the failure this catches.
    const missing = ACCOUNT_TYPES.filter((accountType) => !CATEGORY_COLORS[accountType])
    expect(missing).toEqual([])
  })

  it('defines no colour for a type that is not in the vocabulary', () => {
    // The other drift direction: a stale key left behind after a rename is dead
    // config that reads like coverage.
    const known = new Set<string>(ACCOUNT_TYPES)
    const orphans = Object.keys(CATEGORY_COLORS).filter((key) => !known.has(key))
    expect(orphans).toEqual([])
  })
})
