import { rawColors } from '@/constants/colors'
import {
  ACCOUNT_TYPE_VALUES,
  UNCLASSIFIED_ACCOUNT_TYPE,
  type AccountTypeValue,
} from '@/services/api/accountClassifications'

/**
 * The display categories this module groups accounts into.
 *
 * NOT the same vocabulary as the wire `AccountTypeValue`: `Cash` and
 * `Other Wallets` collapse into one `Cash & Wallets` bucket, and `Other` is the
 * fallback for an account the user never classified. Everything else passes the
 * wire value through unchanged.
 */
export const NET_WORTH_CATEGORIES = [
  'Cash & Wallets',
  'Bank Accounts',
  'Investments',
  'Credit Cards',
  'Loans/Lended',
  'Other',
] as const

export type NetWorthCategory = (typeof NET_WORTH_CATEGORIES)[number]

/**
 * Categories excluded from the stacked asset series: liabilities plus the
 * unclassified bucket. Kept here next to `NET_WORTH_CATEGORIES` so a renamed
 * category cannot silently stop being excluded.
 */
export const NON_ASSET_CATEGORIES: readonly NetWorthCategory[] = [
  'Credit Cards',
  'Loans/Lended',
  'Other',
]

/**
 * Narrows a raw classification string to the wire vocabulary.
 *
 * `useAccountClassifications` is typed `Record<string, string>` because it comes
 * straight off the wire, so the switch below cannot be exhaustive on its own.
 * Routing every classification through this guard is what makes the drift this
 * replaced impossible: a `case` for a value the backend does not serve (there
 * was a `case 'Loans':`, while `AccountType.LOANS` serializes as
 * `'Loans/Lended'`) no longer type-checks.
 */
function asAccountTypeValue(value: string): AccountTypeValue | null {
  return (ACCOUNT_TYPE_VALUES as readonly string[]).includes(value)
    ? (value as AccountTypeValue)
    : null
}

/** Category display configuration */
export const CATEGORY_CONFIG: Record<string, { label: string; color: string }> = {
  'Cash & Wallets': { label: 'Cash & Wallets', color: rawColors.app.green },
  'Bank Accounts': { label: 'Bank Accounts', color: rawColors.app.blue },
  Investments: { label: 'Investments', color: rawColors.app.purple },
  'Loans/Lended': { label: 'Loans/Lended', color: rawColors.app.red },
  'Credit Cards': { label: 'Credit Cards', color: rawColors.app.orange },
  cashbank: { label: 'Cash & Bank', color: rawColors.app.blue },
  invested: { label: 'Investments', color: rawColors.app.purple },
  lended: { label: 'Lended', color: rawColors.app.teal },
  liability: { label: 'Liabilities', color: rawColors.app.red },
  other: { label: 'Other', color: rawColors.text.tertiary },
}

/** Classify an account based on classifications map, investment mappings, or name heuristics. */
export function resolveAccountType(
  accountName: string,
  classifications: Record<string, string>,
  investmentMappings: Record<string, unknown>,
): string {
  if (classifications[accountName]) {
    if (classifications[accountName] === 'Investments') return 'Investments'
    if (classifications[accountName] === 'Cash' || classifications[accountName] === 'Other Wallets')
      return 'Cash & Wallets'
    return classifications[accountName]
  }
  if (investmentMappings[accountName]) return 'Investments'
  const name = accountName.toLowerCase()
  if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
  if (name.includes('bank')) return 'Bank Accounts'
  if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
  return 'Other'
}

/** Classify an account into a display category for grouping. */
export function resolveAccountCategory(
  accountName: string,
  classifications: Record<string, string>,
  investmentMappings: Record<string, unknown>,
): NetWorthCategory {
  const classification = classifications[accountName]
  if (classification) {
    // `Other` is the documented response for an unclassified account, so it
    // reaches the name heuristics below rather than short-circuiting here.
    if (classification !== UNCLASSIFIED_ACCOUNT_TYPE) {
      const accountType = asAccountTypeValue(classification)
      // A value outside the wire vocabulary means the backend enum grew a member
      // the frontend has not been taught. Falling through to the heuristics
      // guesses from the name instead of grouping the account under a category
      // no chart or table knows how to colour.
      if (accountType !== null) return categoryForAccountType(accountType)
    }
  }
  if (investmentMappings[accountName]) return 'Investments'
  const name = accountName.toLowerCase()
  if (name.includes('credit') || name.includes('card')) return 'Credit Cards'
  if (name.includes('bank')) return 'Bank Accounts'
  if (name.includes('cash') || name.includes('wallet')) return 'Cash & Wallets'
  if (name.includes('loan') || name.includes('emi') || name.includes('lend')) return 'Loans/Lended'
  return 'Other'
}

/**
 * Maps every wire account type onto a display category.
 *
 * Exhaustive over `AccountTypeValue` by construction -- a new backend enum
 * member makes this object a compile error, which is the whole point.
 */
const CATEGORY_BY_ACCOUNT_TYPE: Record<AccountTypeValue, NetWorthCategory> = {
  Cash: 'Cash & Wallets',
  'Other Wallets': 'Cash & Wallets',
  'Bank Accounts': 'Bank Accounts',
  Investments: 'Investments',
  'Credit Cards': 'Credit Cards',
  'Loans/Lended': 'Loans/Lended',
}

function categoryForAccountType(accountType: AccountTypeValue): NetWorthCategory {
  return CATEGORY_BY_ACCOUNT_TYPE[accountType]
}

/** Compute daily cumulative net worth from transactions. */
export function computeNetWorthTimeSeries(
  transactions: Array<{ date: string; type: string; amount: number }>,
  allCategories: string[],
  categoryProportions: Record<string, number>,
): Array<Record<string, number | string>> {
  if (!transactions.length) return []

  const dailyMap: Record<string, { income: number; expense: number }> = {}
  for (const tx of transactions) {
    const day = tx.date.substring(0, 10)
    if (!dailyMap[day]) dailyMap[day] = { income: 0, expense: 0 }
    if (tx.type === 'Income') dailyMap[day].income += tx.amount
    else if (tx.type === 'Expense') dailyMap[day].expense += tx.amount
  }

  const sortedDays = Object.entries(dailyMap).sort(([a], [b]) => a.localeCompare(b))
  let cumNW = 0
  let cumIncome = 0
  let cumExpense = 0

  return sortedDays.map(([date, { income, expense }]) => {
    const flow = income - expense
    cumNW += flow
    cumIncome += income
    cumExpense += expense
    const positiveNW = Math.max(cumNW, 0)

    const point: Record<string, number | string> = {
      date,
      netWorth: cumNW,
      dailyFlow: flow,
      cumulativeIncome: cumIncome,
      cumulativeExpenses: cumExpense,
    }

    allCategories.forEach((cat) => {
      point[cat] = positiveNW * (categoryProportions[cat] || 0)
    })

    return point
  })
}

export function ariaSort(
  activeKey: string | null,
  column: string,
  dir: 'asc' | 'desc',
): 'ascending' | 'descending' | 'none' {
  if (activeKey !== column) return 'none'
  return dir === 'asc' ? 'ascending' : 'descending'
}
