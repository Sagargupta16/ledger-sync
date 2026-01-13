import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AccountType = 'investment' | 'deposit' | 'loan'

interface AccountState {
  accountTypes: Record<string, AccountType[]>
  setAccountType: (accountName: string, types: AccountType[]) => void
  getAccountTypes: (accountName: string) => AccountType[]
  isAccountType: (accountName: string, type: AccountType) => boolean | undefined
}

export const useAccountStore = create<AccountState>()(
  persist(
    (set, get) => ({
      accountTypes: {},
      setAccountType: (accountName, types) =>
        set((state) => ({
          accountTypes: { ...state.accountTypes, [accountName]: types },
        })),
      getAccountTypes: (accountName) => get().accountTypes[accountName] || [],
      isAccountType: (accountName, type) => {
        const types = get().accountTypes[accountName]
        if (!types || types.length === 0) return undefined
        return types.includes(type)
      },
    }),
    {
      name: 'account-classification-storage',
    },
  ),
)
