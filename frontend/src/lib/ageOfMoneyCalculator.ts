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

/** Build a spendable-account test from the user's classifications. */
export function spendableAccountTest(
  classifications: Readonly<Record<string, string>>,
): (accountName: string) => boolean {
  return (accountName) => isSpendableAccount(accountName, classifications[accountName])
}

interface AgeOfMoneyTransaction {
  type: string
  amount: number
  date: string
  from_account?: string | null
  to_account?: string | null
}

const TRANSFER_TYPES: ReadonlySet<string> = new Set(['Transfer', 'Transfer-In', 'Transfer-Out'])

/**
 * How a transfer moves money relative to the spendable pool.
 *
 * With a spendable-account test, only moves that cross the pool boundary count:
 * cash -> investment (SIP, PPF) leaves it, a redemption back to cash re-enters
 * it, and a move between the user's own cash accounts changes nothing. Without
 * one, a transfer cannot be placed, so every outgoing transfer is treated as
 * leaving the pool: dropping a real SIP outflow lets income sit in the FIFO
 * queue forever and the age grows without bound.
 */
function transferDirection(
  tx: AgeOfMoneyTransaction,
  isSpendable: ((accountName: string) => boolean) | undefined,
): 'out' | 'in' | 'none' {
  if (!isSpendable || !tx.from_account || !tx.to_account) {
    return tx.type === 'Transfer-In' ? 'none' : 'out'
  }
  const fromCash = isSpendable(tx.from_account)
  const toCash = isSpendable(tx.to_account)
  if (fromCash && !toCash) return 'out'
  if (!fromCash && toCash) return 'in'
  return 'none'
}

/** Dequeue `amount` from the oldest buckets; returns the amount-weighted age sum. */
function dequeue(queue: IncomeBucket[], amount: number, date: string): { ageSum: number; matched: number } {
  let remaining = amount
  let ageSum = 0
  let matched = 0
  const spendTime = new Date(date).getTime()

  while (remaining > 0 && queue.length > 0) {
    const bucket = queue[0]
    const take = Math.min(remaining, bucket.remaining)
    const ageDays = Math.max(0, (spendTime - new Date(bucket.date).getTime()) / MS_PER_DAY)

    ageSum += take * ageDays
    matched += take
    bucket.remaining -= take
    remaining -= take

    if (bucket.remaining <= 0) queue.shift()
  }
  return { ageSum, matched }
}

/**
 * Compute the "Age of Money" using FIFO matching.
 *
 * Income (and money re-entering the spendable pool) is enqueued; each expense
 * dequeues from the oldest bucket first and the weighted average age
 * (expense_date - income_date) is reported. Transfers that leave the pool also
 * dequeue, so invested money stops ageing in the queue, but only expenses feed
 * the average: the figure stays "how old is the money you spend".
 *
 * @param isSpendable optional test (see `spendableAccountTest`) that lets
 *   internal cash-to-cash moves be ignored instead of treated as outflows
 * @returns Average age in days, or null if insufficient data
 */
export function computeAgeOfMoney(
  transactions: ReadonlyArray<AgeOfMoneyTransaction>,
  isSpendable?: (accountName: string) => boolean,
): number | null {
  const sorted = [...transactions].sort((a, b) => a.date.localeCompare(b.date))

  const queue: IncomeBucket[] = []
  let ageSum = 0
  let totalMatched = 0

  for (const tx of sorted) {
    const amount = Math.abs(tx.amount)
    if (tx.type === 'Income') {
      queue.push({ date: tx.date, remaining: amount })
    } else if (tx.type === 'Expense') {
      const result = dequeue(queue, amount, tx.date)
      ageSum += result.ageSum
      totalMatched += result.matched
    } else if (TRANSFER_TYPES.has(tx.type)) {
      const direction = transferDirection(tx, isSpendable)
      if (direction === 'out') dequeue(queue, amount, tx.date)
      else if (direction === 'in') queue.push({ date: tx.date, remaining: amount })
    }
  }

  if (totalMatched === 0) return null
  return Math.round(ageSum / totalMatched)
}

type BufferTransactions = ReadonlyArray<{ type: string; amount: number; date: string }>

/**
 * Days of Buffering from a spendable position built by `computeLiquidPosition`.
 *
 * Takes the position, never a pre-summed total: a bare number has already lost
 * the asset/liability split, so it cannot exclude parked deposits
 * (`PARKED_DEPOSIT_PATTERNS`) or subtract card debt via the sign rule. On real
 * audit data that un-split total read 150 days where this path reads 146.
 *
 * @returns Number of days the net pool covers, or null if insufficient data
 */
export function computeDaysOfBuffering(
  liquid: LiquidPosition,
  transactions: BufferTransactions,
  lookbackDays = 90,
): number | null {
  return computeBufferBreakdown(liquid, transactions, lookbackDays)?.days ?? null
}
