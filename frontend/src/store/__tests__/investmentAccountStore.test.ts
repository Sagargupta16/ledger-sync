import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useInvestmentAccountStore } from '../investmentAccountStore'

const STORAGE_KEY = 'investment-account-storage'

/**
 * The persist storage serialises the in-memory Set to a string[] and rebuilds
 * it on read. These tests pin that round-trip plus the tolerated-corruption
 * behaviour, which is what the typed rewrite had to preserve exactly.
 */
describe('investmentAccountStore persistence', () => {
  beforeEach(() => {
    localStorage.clear()
    useInvestmentAccountStore.getState().reset()
  })

  it('writes the Set to localStorage as a plain array', () => {
    useInvestmentAccountStore.getState().setInvestmentAccounts(['Groww', 'Zerodha'])

    const raw = localStorage.getItem(STORAGE_KEY)
    expect(raw).not.toBeNull()
    const parsed: unknown = JSON.parse(raw ?? '')
    expect(parsed).toMatchObject({ state: { investmentAccounts: ['Groww', 'Zerodha'] } })
  })

  it('rehydrates a stored array back into a working Set', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { investmentAccounts: ['EPF Account'] }, version: 0 })
    )

    await useInvestmentAccountStore.persist.rehydrate()

    expect(useInvestmentAccountStore.getState().isInvestmentAccount('EPF Account')).toBe(true)
    expect(useInvestmentAccountStore.getState().getInvestmentAccounts()).toEqual(['EPF Account'])
  })

  it('treats a missing accounts array as empty rather than throwing', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: {}, version: 0 }))

    await useInvestmentAccountStore.persist.rehydrate()

    expect(useInvestmentAccountStore.getState().getInvestmentAccounts()).toEqual([])
  })

  it.each([
    ['not json at all', 'not-json'],
    ['a bare string', '"abc"'],
    ['null', 'null'],
    ['an envelope with no state', '{}'],
    // Truthy but non-iterable: `new Set(123)` / `new Set({...})` raises a
    // TypeError, which is the pre-existing path to warn-and-ignore.
    ['a numeric accounts field', '{"state":{"investmentAccounts":123}}'],
    ['an object accounts field', '{"state":{"investmentAccounts":{"0":"x"}}}'],
  ])('warns and ignores %s', async (_label, stored) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, stored)

    await useInvestmentAccountStore.persist.rehydrate()

    expect(warn).toHaveBeenCalledOnce()
    expect(useInvestmentAccountStore.getState().getInvestmentAccounts()).toEqual([])
    warn.mockRestore()
  })

  it('consumes a truthy non-array accounts field element-wise, as a string does', async () => {
    // A string is iterable, so `new Set('abc')` has always produced the three
    // characters. Pinned because it is the one input class where an
    // Array.isArray guard would silently swallow the value instead.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { investmentAccounts: 'abc' } }))

    await useInvestmentAccountStore.persist.rehydrate()

    expect(useInvestmentAccountStore.getState().getInvestmentAccounts()).toEqual(['a', 'b', 'c'])
  })

  it('falls back to empty for a falsy accounts field without warning', async () => {
    // `|| []` (not `?? []`) is what makes a stored 0 / false resolve to empty.
    // Both operators end at an empty account list, so the warning is the only
    // observable difference: `?? []` would hand `0` to `new Set` and throw.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: { investmentAccounts: 0 } }))

    await useInvestmentAccountStore.persist.rehydrate()

    expect(warn).not.toHaveBeenCalled()
    expect(useInvestmentAccountStore.getState().getInvestmentAccounts()).toEqual([])
    warn.mockRestore()
  })

  it('hydrates despite a non-numeric version', async () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { investmentAccounts: ['NPS'] }, version: '0' })
    )

    await useInvestmentAccountStore.persist.rehydrate()

    expect(useInvestmentAccountStore.getState().getInvestmentAccounts()).toEqual(['NPS'])
  })

  it('carries an unrecognised persisted state key back out on read', async () => {
    // setItem spreads `...value.state`, so the read has to spread too or the
    // store would write fields it can never restore.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ state: { investmentAccounts: ['Groww'], hideZeroBalance: true }, version: 0 })
    )

    await useInvestmentAccountStore.persist.rehydrate()

    // The extra key is not on the store interface by design, so read it back
    // through an unknown-widened view rather than asserting a shape.
    const state = useInvestmentAccountStore.getState() as unknown as Record<string, unknown>
    expect(state.hideZeroBalance).toBe(true)
    expect(useInvestmentAccountStore.getState().getInvestmentAccounts()).toEqual(['Groww'])
  })

  it('toggles an account on and off', () => {
    const { toggleInvestmentAccount } = useInvestmentAccountStore.getState()

    toggleInvestmentAccount('Kuvera')
    expect(useInvestmentAccountStore.getState().isInvestmentAccount('Kuvera')).toBe(true)

    toggleInvestmentAccount('Kuvera')
    expect(useInvestmentAccountStore.getState().isInvestmentAccount('Kuvera')).toBe(false)
  })
})
