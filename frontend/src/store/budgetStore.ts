import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface Budget {
  category: string
  limit: number
  period: 'monthly' | 'yearly'
}

interface BudgetState {
  budgets: Budget[]
  setBudget: (category: string, limit: number, period?: 'monthly' | 'yearly') => void
  removeBudget: (category: string) => void
  clearBudgets: () => void
  getBudget: (category: string) => Budget | undefined
}

export const useBudgetStore = create<BudgetState>()(
  persist(
    (set, get) => ({
      budgets: [],
      setBudget: (category, limit, period = 'monthly') => {
        set((state) => {
          const existing = state.budgets.findIndex((b) => b.category === category)
          if (existing >= 0) {
            const newBudgets = [...state.budgets]
            newBudgets[existing] = { category, limit, period }
            return { budgets: newBudgets }
          }
          return { budgets: [...state.budgets, { category, limit, period }] }
        })
      },
      removeBudget: (category) => {
        set((state) => ({
          budgets: state.budgets.filter((b) => b.category !== category),
        }))
      },
      clearBudgets: () => set({ budgets: [] }),
      getBudget: (category) => get().budgets.find((b) => b.category === category),
    }),
    {
      name: 'ledger-sync-budgets',
    }
  )
)
