import { beforeEach, describe, expect, it, vi } from 'vitest'

import { getVisibleWidgetKeys } from '../quickInsightsData'

/**
 * The widget-visibility reader shares the 'ledger-sync-visible-widgets' key
 * with settings/helpers.ts getStoredWidgets, but the two have DIFFERENT
 * empty-storage defaults on purpose: this one returns null ("no filter, show
 * all"), while getStoredWidgets returns the 6-key DEFAULT_VISIBLE_WIDGETS set.
 * They must not be consolidated. These cases pin the corruption handling that
 * the unknown-narrowing had to leave untouched.
 */
describe('getVisibleWidgetKeys', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns null when nothing is stored, meaning show all', () => {
    expect(getVisibleWidgetKeys()).toBeNull()
  })

  it('returns the stored subset as a Set', () => {
    localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(['savings_rate', 'peak_day']))
    expect(getVisibleWidgetKeys()).toEqual(new Set(['savings_rate', 'peak_day']))
  })

  it('treats 14 or more stored widgets as no filter', () => {
    const all = Array.from({ length: 14 }, (_, i) => `widget_${i}`)
    localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(all))
    expect(getVisibleWidgetKeys()).toBeNull()
  })

  it.each([
    ['an object', '{"savings_rate":true}'],
    ['a number', '123'],
    ['a boolean', 'true'],
    ['null', 'null'],
    ['invalid json', 'nope'],
  ])('warns and falls back to show-all for %s', (_label, stored) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem('ledger-sync-visible-widgets', stored)

    expect(getVisibleWidgetKeys()).toBeNull()
    expect(warn).toHaveBeenCalledOnce()
    warn.mockRestore()
  })

  it('consumes a stored string character-wise rather than swallowing it', () => {
    // A string is iterable, so this has always yielded characters. Pinned
    // because an Array.isArray guard would silently turn it into show-all.
    localStorage.setItem('ledger-sync-visible-widgets', '"abc"')
    expect(getVisibleWidgetKeys()).toEqual(new Set(['a', 'b', 'c']))
  })
})
