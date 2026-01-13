import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface InvestmentAccountStore {
  investmentAccounts: Set<string>
  toggleInvestmentAccount: (accountName: string) => void
  setInvestmentAccounts: (accounts: string[]) => void
  isInvestmentAccount: (accountName: string) => boolean
  getInvestmentAccounts: () => string[]
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
    }),
    {
      name: 'investment-account-storage',
      storage: {
        getItem: (name) => {
          const item = localStorage.getItem(name)
          if (!item) return null
          try {
            const parsed = JSON.parse(item)
            return {
              state: {
                ...parsed.state,
                investmentAccounts: new Set(parsed.state.investmentAccounts || []),
              },
              version: parsed.version,
            }
          } catch {
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
        removeItem: (name) => localStorage.removeItem(name),
      },
    }
  )
)
