/**
 * Build the real-balance position (liquid / investment / liabilities) that the
 * emergency-fund, liquidity, and solvency ratios need.
 *
 * Why this exists: the health score used to derive "liquid assets" as
 * (cumulative income - expenses - net investments), a flow proxy that clamps to
 * 0 whenever lifetime investing exceeds the lifetime cash surplus -- so a user
 * with real bank balances read 0 emergency-fund months. Per FHN/CFSI "Have
 * sufficient liquid savings", the numerator is the CURRENT balance of liquid
 * deposit accounts (checking/savings, cash, wallets), never a flow.
 */

import type { AccountBalances } from '@/services/api/calculations'

import type { BalancePosition } from './healthScoreTypes'

/**
 * Account categories that hold spendable, near-instant money. Fixed deposits
 * and liquid mutual funds are also emergency-fund eligible (T+1 access), but
 * this app files those under "Investments", so they land in investmentAssets --
 * a deliberately conservative liquid figure (understates, never overstates).
 */
const LIQUID_CATEGORIES = new Set(['Cash & Wallets', 'Bank Accounts'])
const INVESTMENT_CATEGORIES = new Set(['Investments'])

/**
 * Fold real account balances into a liquid / investment / liability position.
 *
 * @param accounts  balance-by-account map from `/calculations/account-balances`
 * @param categorize maps an account name to a display category
 *   ('Bank Accounts' | 'Cash & Wallets' | 'Investments' | 'Credit Cards' | ...)
 * @param isExcluded optional predicate to drop accounts the user hid from analytics
 */
export function computeBalancePosition(
  accounts: AccountBalances['accounts'],
  categorize: (accountName: string) => string,
  isExcluded?: (accountName: string) => boolean,
): BalancePosition {
  let liquidAssets = 0
  let investmentAssets = 0
  let totalLiabilities = 0

  for (const [name, entry] of Object.entries(accounts)) {
    if (isExcluded?.(name)) continue
    const balance = entry.balance
    if (balance < 0) {
      // Any negative balance is a liability (credit-card debt, overdraft, a
      // loan account carried negative), regardless of its display category.
      totalLiabilities += -balance
      continue
    }
    if (balance === 0) continue

    const category = categorize(name)
    if (LIQUID_CATEGORIES.has(category)) {
      liquidAssets += balance
    } else if (INVESTMENT_CATEGORIES.has(category)) {
      investmentAssets += balance
    } else {
      // Loans/Lended (money owed TO the user) and anything uncategorized are
      // real net-worth assets but not part of the liquid emergency buffer.
      investmentAssets += balance
    }
  }

  const totalAssets = liquidAssets + investmentAssets
  return {
    liquidAssets,
    investmentAssets,
    totalLiabilities,
    totalAssets,
    netWorth: totalAssets - totalLiabilities,
  }
}
