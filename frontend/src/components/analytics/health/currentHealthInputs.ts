/**
 * Current health from a ledger already in the browser.
 *
 * Folds the preferences, account balances and classifications the health panel
 * reads into `computeCurrentHealth`'s inputs. The Dashboard reads the same
 * analysis from `/api/dashboard-metrics/health` (backend
 * `core/dashboard_metrics_health.py`, a port of this path); this one serves the
 * demo resolver and FinancialHealthScore's `transactions` prop.
 */

import type { AccountBalances } from '@/services/api/calculations'
import type { UserPreferences } from '@/services/api/preferences'
import type { Transaction } from '@/types'
import { capitalLossConfig } from '@/lib/expenseClassification'
import { investmentAccountTest } from '@/lib/finance/investmentFlows'
import { resolveAccountCategory } from '@/pages/net-worth/netWorthUtils'
import { resolveEssentialCategories } from '@/store/preferencesStore'

import { computeCurrentHealth } from './currentHealthAnalysis'
import { computeBalancePosition } from './healthScoreBalances'

/** One current health analysis with the period and employment start behind it. */
export type CurrentHealth = NonNullable<ReturnType<typeof computeCurrentHealth>>

type HealthPreferences = Partial<Pick<
  UserPreferences,
  | 'earning_start_date'
  | 'fixed_expense_categories'
  | 'capital_loss_categories'
  | 'essential_categories'
  | 'investment_account_mappings'
>>

interface LedgerHealthInputs {
  readonly preferences: HealthPreferences | undefined
  readonly accounts: AccountBalances['accounts'] | undefined
  readonly classifications: Record<string, string> | undefined
}

/** `fixed_expense_categories` arrives as a list, or as its stored JSON text. */
function fixedCategorySet(raw: string[] | string | undefined): Set<string> {
  if (!raw) return new Set()
  let arr: string[]
  if (Array.isArray(raw)) {
    arr = raw
  } else {
    try {
      // JSON.parse is typed `any`; keep it at `unknown` and narrow.
      const parsed: unknown = JSON.parse(raw)
      arr = Array.isArray(parsed) ? (parsed as string[]) : []
    } catch {
      arr = []
    }
  }
  return new Set(arr.map((c) => c.toLowerCase()))
}

/**
 * Current health for `transactions` under the user's preferences.
 *
 * Liquid, invested and owed money come from the real account balances when any
 * are recorded (the correct basis for the emergency-fund, liquidity and solvency
 * ratios); with none, the scorers fall back to the cumulative-flow proxy.
 * Investment accounts follow the shared perimeter (mapped names,
 * case-insensitive; the default keywords when nothing is mapped).
 */
export function currentHealthFromLedger(
  transactions: readonly Transaction[],
  { preferences, accounts, classifications }: LedgerHealthInputs,
): CurrentHealth | null {
  const investmentMappings = preferences?.investment_account_mappings ?? {}
  const fixedCategories = fixedCategorySet(preferences?.fixed_expense_categories)
  const balances = accounts && Object.keys(accounts).length > 0
    ? computeBalancePosition(accounts, (name) =>
      resolveAccountCategory(name, classifications ?? {}, investmentMappings))
    : null
  return computeCurrentHealth(transactions, investmentAccountTest(Object.keys(investmentMappings)), {
    earningStartDate: preferences?.earning_start_date,
    fixedCategories: fixedCategories.size > 0 ? fixedCategories : undefined,
    // The classified realised-loss keys `/totals` reads, so a classified loss
    // leaves the score's expenses exactly as it leaves the Dashboard's.
    expenseClassification: capitalLossConfig(preferences?.capital_loss_categories),
    // The Needs list the spending rule reads, so "essential" means the same as on /budgets.
    essentialCategories: resolveEssentialCategories(preferences?.essential_categories),
    balances,
  })
}
