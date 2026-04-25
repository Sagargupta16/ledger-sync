import { describe, expect, it } from 'vitest'

import { clampStartToEarningStart } from '../useAnalyticsTimeFilter'

describe('clampStartToEarningStart', () => {
  it('returns startDate unchanged when useEarningStartDate is false', () => {
    expect(clampStartToEarningStart('2024-05-01', '2024-02-01', false)).toBe('2024-05-01')
    expect(clampStartToEarningStart(null, '2024-02-01', false)).toBeNull()
  })

  it('returns startDate unchanged when earningStartDate is null', () => {
    expect(clampStartToEarningStart('2024-05-01', null, true)).toBe('2024-05-01')
    expect(clampStartToEarningStart(null, null, true)).toBeNull()
  })

  it('returns the earning date when startDate is null and preference is active', () => {
    expect(clampStartToEarningStart(null, '2024-02-01', true)).toBe('2024-02-01')
  })

  it('clamps up when startDate is before the earning date', () => {
    expect(clampStartToEarningStart('2024-01-15', '2024-02-01', true)).toBe('2024-02-01')
    expect(clampStartToEarningStart('2023-06-01', '2024-02-01', true)).toBe('2024-02-01')
  })

  it('leaves startDate alone when it is already after the earning date', () => {
    expect(clampStartToEarningStart('2024-03-15', '2024-02-01', true)).toBe('2024-03-15')
    expect(clampStartToEarningStart('2025-01-01', '2024-02-01', true)).toBe('2025-01-01')
  })

  it('treats an equal start as "after" (no clamp needed)', () => {
    expect(clampStartToEarningStart('2024-02-01', '2024-02-01', true)).toBe('2024-02-01')
  })

  it('truncates earning date with time component to YYYY-MM-DD', () => {
    expect(clampStartToEarningStart(null, '2024-02-01T00:00:00Z', true)).toBe('2024-02-01')
  })
})
