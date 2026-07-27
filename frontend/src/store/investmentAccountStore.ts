import { create } from 'zustand'
import { persist, type PersistStorage, type StorageValue } from 'zustand/middleware'

interface InvestmentAccountStore {
  investmentAccounts: Set<string>
  toggleInvestmentAccount: (accountName: string) => void
  setInvestmentAccounts: (accounts: string[]) => void
  isInvestmentAccount: (accountName: string) => boolean
  getInvestmentAccounts: () => string[]
  /** Clear all classifications (called on logout to avoid cross-user leak). */
  reset: () => void
}

/**
 * Persisted shape. The store's methods are dropped by JSON.stringify, so
 * `investmentAccounts` is the only meaningful key, but the index signature is
 * deliberate: `setItem` spreads `...value.state`, so the read has to carry any
 * other stored key back out or the two halves of the round-trip diverge.
 */
interface PersistedInvestmentAccounts {
  [key: string]: unknown
  investmentAccounts: Set<string>
}

/**
 * Narrow an unknown JSON payload to the persisted envelope.
 *
 * Throws on a malformed envelope so the caller's catch emits the same warning
 * it always did: previously `parsed.state.investmentAccounts` raised a
 * TypeError for these inputs, so null-plus-warning is the established
 * behaviour for `{}`, `null`, `"abc"`, and `[]`. A present-but-empty
 * `{"state":{}}` still resolves to an empty Set rather than null.
 */
function parseStoredValue(raw: unknown): StorageValue<PersistedInvestmentAccounts> {
  if (typeof raw !== 'object' || raw === null) {
    throw new TypeError('persisted value is not an object')
  }
  const { state, version } = raw as { state?: unknown; version?: unknown }
  if (typeof state !== 'object' || state === null) {
    throw new TypeError('persisted value has no state object')
  }
  // `Iterable<string>` mirrors what the old `new Set(x || [])` accepted: any
  // truthy iterable is consumed element-wise and a truthy non-iterable still
  // throws into the caller's catch. `||` (not `??`) is load-bearing -- a stored
  // `0`/`false` fell back to `[]` rather than throwing.
  const { investmentAccounts } = state as { investmentAccounts?: Iterable<string> }
  return {
    state: {
      ...(state as Record<string, unknown>),
      investmentAccounts: new Set(investmentAccounts || []),
    },
    // zustand only ever reads this through `typeof version === 'number'`
    // (middleware.js:394), so coercing a non-numeric stored version to
    // undefined is indistinguishable from passing it through verbatim.
    version: typeof version === 'number' ? version : undefined,
  }
}

const investmentAccountStorage: PersistStorage<PersistedInvestmentAccounts> = {
  getItem: (name) => {
    const item = localStorage.getItem(name)
    if (!item) return null
    try {
      return parseStoredValue(JSON.parse(item))
    } catch (e) {
      console.warn('[investmentAccountStore] Failed to parse cached data:', e)
      return null
    }
  },
  setItem: (name, value) => {
    const toStore = {
      ...value,
      state: {
        ...value.state,
        investmentAccounts: Array.from(value.state.investmentAccounts),
      },
    }
    localStorage.setItem(name, JSON.stringify(toStore))
  },
  removeItem: (name) => {
    localStorage.removeItem(name)
  },
}

export const useInvestmentAccountStore = create<InvestmentAccountStore>()(
  persist(
    (set, get) => ({
      investmentAccounts: new Set<string>(),

      toggleInvestmentAccount: (accountName: string) => {
        set((state) => {
          const newAccounts = new Set(state.investmentAccounts)
          if (newAccounts.has(accountName)) {
            newAccounts.delete(accountName)
          } else {
            newAccounts.add(accountName)
          }
          return { investmentAccounts: newAccounts }
        })
      },

      setInvestmentAccounts: (accounts: string[]) => {
        set({ investmentAccounts: new Set(accounts) })
      },

      isInvestmentAccount: (accountName: string) => {
        return get().investmentAccounts.has(accountName)
      },

      getInvestmentAccounts: () => {
        return Array.from(get().investmentAccounts)
      },

      reset: () => set({ investmentAccounts: new Set<string>() }),
    }),
    {
      name: 'investment-account-storage',
      storage: investmentAccountStorage,
    }
  )
)
