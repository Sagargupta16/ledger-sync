/**
 * Age of Money & Days of Buffering Calculators
 *
 * Age of Money (YNAB concept): Uses FIFO matching to determine how old
 * the money you're spending today is. Higher = more financial runway.
 *
 * Days of Buffering: How many days your genuinely spendable balance can cover
 * at your current burn rate. "Spendable" is derived from the account
 * classification data, never from a hardcoded account list.
 */

import { MS_PER_DAY, addDaysToKey, getDateKey, inclusiveDaySpan, toLocalDateKey } from '@/lib/dateUtils'

interface IncomeBucket {
  date: string
  remaining: number
}

/** Minimal shape of one entry in `/api/calculations/account-balances`. */
interface AccountBalanceLike {
  readonly balance: number
}

/**
 * Backend `AccountType` enum values whose balances are candidates for the
 * spendable pool. Everything else is excluded by construction: `Investments` is
 * locked, `Loans/Lended` is a receivable the counterparty controls, and
 * `Credit Cards` is a liability.
 */
const SPENDABLE_CLASSIFICATIONS: ReadonlySet<string> = new Set([
  'Cash',
  'Bank Accounts',
  'Other Wallets',
])

/**
 * Parked money that is not spendable even when filed under a spendable
 * classification. The enum has no "deposit" member, so a rental security
 * deposit lands in `Other Wallets` beside real wallets, yet a landlord holds
 * it: it cannot fund next month's groceries.
 *
 * Every pattern requires the "held by a third party" sense, so a genuine
 * "HDFC Deposit Account" savings account still counts as liquid. Deliberately
 * narrower than `ACCOUNT_TYPE_RULES`, whose bare `fund` / `visa` / `rupay`
 * words match spendable accounts ("Emergency Fund", "RuPay Debit") as often as
 * parked ones -- running that classifier here silently zeroed real balances the
 * user had explicitly filed as Bank Accounts.
 */
const PARKED_DEPOSIT_PATTERNS: readonly RegExp[] = [
  /\bsecurity\s+deposits?\b/i,
  /\brent(?:al)?\s+deposits?\b/i,
  /\bcaution\s+(?:money|deposits?)\b/i,
  /\bescrow\b/i,
  /^\s*deposits?\s*$/i,
]

/**
 * Is this account real, spendable money?
 *
 * The user's explicit classification decides, with one narrow lexical override
 * for deposits the enum cannot express. A misfiled card needs no name guess:
 * it carries a negative balance, and the sign rule below routes any negative
 * to liabilities wherever it sits.
 */
function isSpendableAccount(name: string, classification: string | undefined): boolean {
  if (classification === undefined || !SPENDABLE_CLASSIFICATIONS.has(classification)) return false
  return !PARKED_DEPOSIT_PATTERNS.some((pattern) => pattern.test(name))
}

/** The spendable position behind a buffer figure, assets and debt kept separate. */
export interface LiquidPosition {
  /** Sum of POSITIVE spendable balances. Never includes a liability. */
  readonly grossLiquid: number
  /**
   * Money already owed: card outstanding plus any overdrawn spendable account.
   * Named to match `totalLiabilities` in `health/healthScoreBalances.ts`, which
   * folds the same quantity -- calling it `cardOutstanding` invited a UI to
   * label a bank overdraft as card debt.
   */
  readonly liabilities: number
  /** `grossLiquid - liabilities`, floored at 0. */
  readonly netLiquid: number
}

/**
 * Fold real account balances into a spendable position.
 *
 * Sign is decided before category: a negative balance is debt wherever it sits.
 * That single rule is what keeps a card misfiled under `Bank Accounts` out of
 * the pool, without guessing at account names.
 */
export function computeLiquidPosition(
  accounts: Readonly<Record<string, AccountBalanceLike>>,
  classifications: Readonly<Record<string, string>>,
  isExcluded?: (accountName: string) => boolean,
): LiquidPosition {
  let grossLiquid = 0
  let liabilities = 0

  for (const [name, account] of Object.entries(accounts)) {
    if (isExcluded?.(name)) continue
    const balance = Number(account.balance)
    if (!Number.isFinite(balance) || balance === 0) continue

    if (classifications[name] === 'Credit Cards') {
      // A positive card balance is a prepayment or pending refund, not cash in
      // a bank account, so it adds nothing to what you can spend.
      if (balance < 0) liabilities += -balance
      continue
    }

    if (!isSpendableAccount(name, classifications[name])) continue

    if (balance > 0) grossLiquid += balance
    // An overdrawn bank or wallet is money already owed, same as card debt.
    else liabilities += -balance
  }

  return {
    grossLiquid,
    liabilities,
    netLiquid: Math.max(0, grossLiquid - liabilities),
  }
}

/** Burn rate over the observed window, both central tendencies reported. */
export interface DailyBurn {
  /** Total outflow divided by the observed span. Drives the headline buffer. */
  readonly mean: number
  /** Median of every calendar day in the span, no-spend days counted as 0. */
  readonly median: number
  readonly spanDays: number
  readonly totalSpend: number
}

/**
 * Compute mean and median daily burn over a trailing window.
 *
 * @returns `null` when the window holds no spending at all
 */
export function computeDailyBurn(
  transactions: ReadonlyArray<{ type: string; amount: number; date: string }>,
  lookbackDays = 90,
): DailyBurn | null {
  const todayKey = toLocalDateKey(new Date())
  const cutoffKey = addDaysToKey(todayKey, -(lookbackDays - 1))

  const spendByDay = new Map<string, number>()
  let totalSpend = 0
  let earliestKey = ''

  for (const tx of transactions) {
    if (tx.type !== 'Expense') continue
    const key = getDateKey(tx.date)
    if (key < cutoffKey || key > todayKey) continue
    const amount = Math.abs(tx.amount)
    if (!Number.isFinite(amount)) continue
    totalSpend += amount
    spendByDay.set(key, (spendByDay.get(key) ?? 0) + amount)
    if (earliestKey === '' || key < earliestKey) earliestKey = key
  }

  if (spendByDay.size === 0 || totalSpend <= 0) return null

  // Divide by the span the data actually covers, not the full lookback window.
  // For users with less than lookbackDays of history the fixed window dilutes
  // the burn across empty days and massively overstates runway.
  const spanDays = inclusiveDaySpan(earliestKey, todayKey)

  // Median over EVERY calendar day in the span, no-spend days included as 0.
  // Medianing only the days that had a transaction would silently redefine
  // "typical day" as "typical spending day".
  const dailyTotals: number[] = []
  for (let i = 0; i < spanDays; i += 1) {
    dailyTotals.push(spendByDay.get(addDaysToKey(earliestKey, i)) ?? 0)
  }
  dailyTotals.sort((a, b) => a - b)
  const mid = Math.floor(dailyTotals.length / 2)
  const median =
    dailyTotals.length % 2 === 0 ? (dailyTotals[mid - 1] + dailyTotals[mid]) / 2 : dailyTotals[mid]

  return { mean: totalSpend / spanDays, median, spanDays, totalSpend }
}

/**
 * A buffer figure with the inputs that produced it. Composed rather than
 * re-flattened so the displayed pool can never drift from the pool that was
 * divided, and so a caller can label the burn rate it was measured against.
 */
export interface BufferBreakdown {
  /** Days the net pool covers TOTAL outflow at the mean burn. */
  readonly days: number
  readonly liquid: LiquidPosition
  readonly burn: DailyBurn
}

/**
 * Days of Buffering, with the inputs that produced it.
 *
 * Numerator is NET liquid (spendable minus what is already owed on cards).
 * Gross would tell someone who must clear a card this month that they have
 * money they do not have.
 *
 * Denominator is the MEAN daily burn, not the median. This ledger is severely
 * right-skewed (measured over the trailing 90 days: median daily spend 528.20
 * against a mean of 3,342.68, and the top 1% of transactions is 56.6% of all
 * spend). "How long does my cash last" is a total-outflow question: if income
 * stopped, rent, EMIs and the annual premium still land, and those fat-tail
 * rows ARE the spend. A median denominator answers a different question ("what
 * does an ordinary day cost") and on this data would stretch the same pool from
 * 146 days to 921 -- a 6.3x overstatement, so it is reported as a burn RATE in
 * `burn.median` and never published as a days-of-buffer figure.
 *
 * @returns `null` when there is no spending in the window to rate against
 */
export function computeBufferBreakdown(
  liquid: LiquidPosition,
  transactions: ReadonlyArray<{ type: string; amount: number; date: string }>,
  lookbackDays = 90,
): BufferBreakdown | null {
  const burn = computeDailyBurn(transactions, lookbackDays)
  if (burn === null) return null

  // computeDailyBurn already returns null on zero spend, so mean > 0 holds
  // today. The guard stays explicit so no future caller can divide by zero and
  // render "Infinity days", and an underwater pool reads 0 days, not negative.
  if (!Number.isFinite(liquid.netLiquid) || !Number.isFinite(burn.mean) || burn.mean <= 0) {
    return null
  }

  return { days: Math.max(0, Math.round(liquid.netLiquid / burn.mean)), liquid, burn }
}

/**
 * Compute the "Age of Money" using FIFO matching.
 *
 * For each expense, dequeue from the oldest income bucket first.
 * Track the weighted average age (expense_date - income_date).
 *
 * @returns Average age in days, or null if insufficient data
 */
export function computeAgeOfMoney(
  transactions: Array<{ type: string; amount: number; date: string }>,
): number | null {
  // Sort all transactions by date
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

  const queue: IncomeBucket[] = []
  let ageSum = 0
  let totalMatched = 0

  for (const tx of sorted) {
    if (tx.type === 'Income') {
      queue.push({ date: tx.date, remaining: Math.abs(tx.amount) })
      continue
    }

    if (tx.type !== 'Expense') continue

    let remaining = Math.abs(tx.amount)
    const expenseDate = new Date(tx.date)

    while (remaining > 0 && queue.length > 0) {
      const bucket = queue[0]
      const matched = Math.min(remaining, bucket.remaining)
      const incomeDate = new Date(bucket.date)
      const ageDays = Math.max(0, (expenseDate.getTime() - incomeDate.getTime()) / MS_PER_DAY)

      ageSum += matched * ageDays
      totalMatched += matched
      bucket.remaining -= matched
      remaining -= matched

      if (bucket.remaining <= 0) {
        queue.shift()
      }
    }
  }

  if (totalMatched === 0) return null
  return Math.round(ageSum / totalMatched)
}

type BufferTransactions = ReadonlyArray<{ type: string; amount: number; date: string }>

/**
 * Days of Buffering from a spendable position built by `computeLiquidPosition`.
 *
 * @returns Number of days the net pool covers, or null if insufficient data
 */
export function computeDaysOfBuffering(
  liquid: LiquidPosition,
  transactions: BufferTransactions,
  lookbackDays?: number,
): number | null
/**
 * @deprecated Pass a `LiquidPosition` instead. A bare total has already lost
 * the asset/liability split, so this branch cannot exclude parked deposits or
 * subtract card debt -- it can only take the caller's number at face value. On
 * real audit data the un-split total reads 150 days where the split-aware path
 * reads 146.
 *
 * TODO: remove this overload once `pages/DashboardPage.tsx` (the last consumer,
 * at its `computeDaysOfBuffering(liquidBalance, filteredTransactions)` call)
 * builds its pool with `computeLiquidPosition` and drops its local
 * `LIQUID_CLASSIFICATIONS` set.
 */
export function computeDaysOfBuffering(
  liquid: number,
  transactions: BufferTransactions,
  lookbackDays?: number,
): number | null
export function computeDaysOfBuffering(
  liquid: number | LiquidPosition,
  transactions: BufferTransactions,
  lookbackDays = 90,
): number | null {
  const position: LiquidPosition =
    typeof liquid === 'number'
      ? { grossLiquid: liquid, liabilities: 0, netLiquid: Math.max(0, liquid) }
      : liquid

  return computeBufferBreakdown(position, transactions, lookbackDays)?.days ?? null
}
