/**
 * Per-account running balances behind the Investment Analytics growth chart:
 * which ledger rows move an investment account, and what every account is worth
 * at the close of each day that had activity.
 *
 * Split out of `investmentUtils.ts` so that file stays inside the module budget
 * once these steps are named. Everything here is deliberately category-agnostic
 * -- it deals only in account names -- which keeps the import one-way and leaves
 * the category taxonomy owned by `investmentUtils.ts`.
 */

/** Minimal transaction shape the growth series needs. */
export type GrowthTransaction = {
  date: string
  type: string
  amount: number
  to_account?: string | null
  from_account?: string | null
  account?: string | null
}

/** Answers "is this account name one of the user's investment accounts". */
export type AccountTest = (name: string | null | undefined) => boolean

/** Bind the membership test to the configured investment accounts. */
export function investmentAccountTest(investmentAccounts: readonly string[]): AccountTest {
  const accountSet = new Set(investmentAccounts)
  return (name) => name != null && accountSet.has(name)
}

/**
 * Rows that move an investment account: a transfer with either leg inside the
 * portfolio, or income/expense landing directly on a holding.
 */
function touchesInvestmentAccount(tx: GrowthTransaction, isInvestment: AccountTest): boolean {
  if (tx.type === 'Transfer') {
    return isInvestment(tx.to_account) || isInvestment(tx.from_account)
  }
  return (tx.type === 'Income' || tx.type === 'Expense') && isInvestment(tx.account)
}

/**
 * The investment rows, oldest first.
 *
 * Sorted on the raw date string: every date here is an ISO key or an ISO
 * timestamp, so lexicographic order is chronological order, and the running
 * balances below depend on that order. `filter` has already copied the array, so
 * the caller's transactions are never reordered.
 */
export function selectInvestmentTransactions(
  transactions: readonly GrowthTransaction[],
  isInvestment: AccountTest,
): GrowthTransaction[] {
  return transactions
    .filter((tx) => touchesInvestmentAccount(tx, isInvestment))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Apply one row to the running per-account balances. BOTH legs of a transfer
 * count, so a holding-to-holding move debits one account and credits the other
 * off the same row.
 */
function applyToRunningBalances(
  running: Record<string, number>,
  tx: GrowthTransaction,
  isInvestment: AccountTest,
): void {
  if (tx.type === 'Transfer') {
    if (isInvestment(tx.to_account)) running[tx.to_account as string] += tx.amount
    if (isInvestment(tx.from_account)) running[tx.from_account as string] -= tx.amount
  } else if (tx.type === 'Income' && isInvestment(tx.account)) {
    running[tx.account as string] += tx.amount
  } else if (tx.type === 'Expense' && isInvestment(tx.account)) {
    running[tx.account as string] -= tx.amount
  }
}

/**
 * Closing per-account balance for every day that had investment activity, keyed
 * by `YYYY-MM-DD` and inserted oldest first.
 *
 * Every configured account is seeded at zero and stays present in every
 * snapshot. That is precisely what lets `applyDaySnapshot` tell "this day says
 * nothing about the account" apart from "this account is now worth zero".
 */
export function buildDailyAccountSnapshots(
  investmentTransactions: readonly GrowthTransaction[],
  investmentAccounts: readonly string[],
  isInvestment: AccountTest,
): Map<string, Record<string, number>> {
  const running: Record<string, number> = {}
  for (const acc of investmentAccounts) running[acc] = 0

  const snapshotMap = new Map<string, Record<string, number>>()
  let currentDay = ''

  for (const tx of investmentTransactions) {
    const dayKey = tx.date.substring(0, 10)
    // The rows arrive date-sorted, so crossing into a new day is what closes the
    // previous one. Same-day rows therefore net into one snapshot.
    if (dayKey !== currentDay && currentDay !== '') {
      snapshotMap.set(currentDay, { ...running })
    }
    currentDay = dayKey
    applyToRunningBalances(running, tx, isInvestment)
  }
  // The last day has no successor to close it.
  if (currentDay) snapshotMap.set(currentDay, { ...running })

  return snapshotMap
}

/**
 * Carry a day's snapshot into the forward-filled per-account balances.
 *
 * The test is a KEY CHECK, not truthiness. Snapshots are cloned from a map
 * pre-seeded with every investment account, so every account is always present
 * -- meaning `snapshot[acc] || lastKnown[acc]` could only ever discard a
 * legitimate exact ZERO. A fully-redeemed holding stayed plotted at its
 * pre-redemption value forever, and the stacked total drifted above
 * `totalInvestmentValue`, the KPI on the same page.
 */
export function applyDaySnapshot(
  lastKnown: Record<string, number>,
  snapshot: Record<string, number>,
  investmentAccounts: readonly string[],
): void {
  for (const account of investmentAccounts) {
    if (account in snapshot) lastKnown[account] = snapshot[account]
  }
}
