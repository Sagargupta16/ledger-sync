import { accountClassificationsService } from '@/services/api/accountClassifications'
import { calculateXIRR } from '@/lib/xirr'
import { addMonthsToKey, formatMonthKey, MS_PER_YEAR } from '@/lib/dateUtils'
import type { Transaction } from '@/types'

import type { ChartDataPoint, MutualFundAccount } from './types'

/**
 * X-axis label shape ("Aug 26"). Shared by the historical and projection
 * halves so the two series land on one label vocabulary -- they used to build
 * labels through separate `Date` paths and could disagree.
 */
const MF_MONTH_LABEL_OPTS: Intl.DateTimeFormatOptions = { month: 'short', year: '2-digit' }

/** Calculate SIP future value with monthly compounding. */
export function calculateSIPProjection(
  monthlySIP: number,
  annualRate: number,
  years: number,
  sipGrowthRate: number,
  startingCorpus: number,
): { value: number; invested: number; returns: number } {
  const monthlyRate = annualRate / 12 / 100
  let totalInvested = startingCorpus
  let portfolioValue = startingCorpus
  let currentMonthlySIP = monthlySIP

  for (let month = 1; month <= years * 12; month++) {
    totalInvested += currentMonthlySIP
    portfolioValue = (portfolioValue + currentMonthlySIP) * (1 + monthlyRate)

    if (month % 12 === 0 && sipGrowthRate > 0) {
      currentMonthlySIP = currentMonthlySIP * (1 + sipGrowthRate / 100)
    }
  }

  return {
    value: portfolioValue,
    invested: totalInvested,
    returns: portfolioValue - totalInvested,
  }
}

/** Integer month index (year*12 + monthIndex) for a `YYYY-MM` key, for gap math. */
function monthIndexOfKey(monthKey: string): number {
  const [year, month] = monthKey.split('-').map(Number)
  return year * 12 + (month - 1)
}

/**
 * Build historical chart data from SIP transfers.
 *
 * Each output point carries three series:
 * - `invested`: cumulative principal contributed through that month.
 * - `value`: the *actual* portfolio value, back-distributed across months in
 *   proportion to how much was invested by then (so the latest point equals the
 *   real current balance).
 * - `expectedValue`: what the portfolio *should* be worth that month if every
 *   contribution had compounded at `expectedReturn` from its own investment
 *   month. Comparing `value` vs `expectedValue` shows whether the real fund is
 *   running ahead of or behind the assumed return.
 */
export function buildHistoricalChartData(
  sipTransfers: Array<{ date: string; amount: number }>,
  effectiveCurrentValue: number,
  expectedReturn = 0,
): ChartDataPoint[] {
  const data: ChartDataPoint[] = []
  let cumulativeInvested = 0
  const monthlyInvested = new Map<string, number>()

  for (const tx of sipTransfers) {
    const date = new Date(tx.date)
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    cumulativeInvested += tx.amount
    monthlyInvested.set(monthKey, cumulativeInvested)
  }

  const totalInvested = cumulativeInvested
  const totalGains = effectiveCurrentValue - totalInvested
  const monthlyRate = expectedReturn / 12 / 100

  // Pre-bucket each transfer by its month index so the expected-value pass can
  // compound every contribution forward without re-parsing dates each month.
  const contributionsByMonth = new Map<number, number>()
  for (const tx of sipTransfers) {
    const d = new Date(tx.date)
    const idx = d.getFullYear() * 12 + d.getMonth()
    contributionsByMonth.set(idx, (contributionsByMonth.get(idx) ?? 0) + tx.amount)
  }

  Array.from(monthlyInvested.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([monthKey, invested]) => {
      const monthLabel = formatMonthKey(monthKey, MF_MONTH_LABEL_OPTS)

      const proportionalValue = totalInvested > 0
        ? invested + (invested / totalInvested) * totalGains
        : invested

      // Expected value at this month = each prior contribution grown at the
      // monthly expected rate for the number of months it has been invested.
      const here = monthIndexOfKey(monthKey)
      let expected = 0
      for (const [contribIdx, amount] of contributionsByMonth) {
        if (contribIdx > here) continue
        expected += amount * (1 + monthlyRate) ** (here - contribIdx)
      }

      data.push({
        month: monthLabel,
        invested: Math.round(invested),
        value: Math.round(proportionalValue),
        expectedValue: Math.round(expected),
        isHistorical: true,
      })
    })

  return data
}

/** Build projection chart data from the last historical data point. */
export function buildProjectionChartData(
  lastHistorical: ChartDataPoint,
  lastDateKey: string,
  activeMonthlySIP: number,
  expectedReturn: number,
  projectionYears: number,
  sipGrowthRate: number,
): ChartDataPoint[] {
  const data: ChartDataPoint[] = []
  let projectedInvested = lastHistorical.invested
  let projectedValue = lastHistorical.value
  let currentSIP = activeMonthlySIP
  const monthlyRate = expectedReturn / 12 / 100

  for (let i = 1; i <= projectionYears * 12; i++) {
    // `addMonthsToKey`, not `setMonth(getMonth() + i)`. When the last SIP falls
    // on day 29-31, `setMonth` overflows odd offsets into the following month,
    // so a 60-point 5-year horizon rendered only 35 distinct month labels --
    // ~25 duplicated x-axis categories and ~25 calendar months with no point,
    // making the compounding curve look like it stepped two months at a time.
    // Key math also drops the UTC-parse/local-getter mix the old `Date` path had.
    const monthLabel = formatMonthKey(addMonthsToKey(lastDateKey, i), MF_MONTH_LABEL_OPTS)

    projectedInvested += currentSIP
    projectedValue = (projectedValue + currentSIP) * (1 + monthlyRate)

    if (i % 12 === 0 && sipGrowthRate > 0) {
      currentSIP *= (1 + sipGrowthRate / 100)
    }

    data.push({
      month: monthLabel,
      invested: Math.round(projectedInvested),
      value: Math.round(projectedValue),
      isHistorical: false,
    })
  }

  return data
}

/** Detect the most recent monthly SIP amount from transfers. */
export function detectMonthlySIPAmount(
  sipTransfers: Array<{ note?: string | null; amount: number }>,
): number {
  if (sipTransfers.length === 0) return 0

  const monthlySIPs = sipTransfers.filter((tx) => {
    const note = (tx.note ?? '').toLowerCase()
    return note.includes('monthly') || (!note.includes('lumpsum') && note.includes('sip'))
  })

  if (monthlySIPs.length === 0) return 0

  return monthlySIPs.at(-1)?.amount ?? 0
}

/** Load mutual fund accounts from balance data and account classifications. */
export async function loadMutualFundAccountsData(
  balanceData: Record<string, unknown> | null | undefined,
): Promise<MutualFundAccount[]> {
  const { accounts: investmentAccounts } =
    await accountClassificationsService.getAccountsByType('Investments')
  const accountsByName = (balanceData as { accounts?: Record<string, { balance: number }> })
    ?.accounts ?? {}

  return Object.entries(accountsByName)
    .filter(([name]) => investmentAccounts.includes(name))
    .filter(([name]) => name.toLowerCase().includes('mutual') || name.toLowerCase().includes('fund'))
    .map(([name, data]) => ({
      name,
      balance: Math.abs(data.balance),
    }))
    .sort((a, b) => b.balance - a.balance)
}

/** Find primary mutual fund account (Grow Mutual Funds or first available). */
export function findPrimaryAccount(
  mutualFundAccounts: MutualFundAccount[],
): MutualFundAccount | null {
  if (mutualFundAccounts.length === 0) return null

  const growAccount = mutualFundAccounts.find(
    (acc) =>
      acc.name.toLowerCase().includes('grow') && acc.name.toLowerCase().includes('mutual'),
  )

  return growAccount ?? mutualFundAccounts[0]
}

/** Build combined historical + projection chart data. */
export function buildCombinedChartData(
  sipTransfers: Array<{ date: string; amount: number }>,
  effectiveCurrentValue: number,
  activeMonthlySIP: number,
  expectedReturn: number,
  projectionYears: number,
  sipGrowthRate: number,
): ChartDataPoint[] {
  if (sipTransfers.length === 0) return []

  const historicalData = buildHistoricalChartData(
    sipTransfers,
    effectiveCurrentValue,
    expectedReturn,
  )

  if (historicalData.length === 0) return historicalData

  const lastHistorical = historicalData.at(-1)
  if (!lastHistorical) return historicalData
  const lastSipTransfer = sipTransfers.at(-1)
  if (!lastSipTransfer) return historicalData
  const projectionData = buildProjectionChartData(
    lastHistorical,
    lastSipTransfer.date.slice(0, 10),
    activeMonthlySIP,
    expectedReturn,
    projectionYears,
    sipGrowthRate,
  )

  return [...historicalData, ...projectionData]
}

/** Compute XIRR percent from SIP cashflows. */
export function computeXirrPercent(
  sipTransfers: Array<{ date: string; amount: number }>,
  effectiveCurrentValue: number,
): number {
  if (sipTransfers.length === 0 || effectiveCurrentValue <= 0) return 0

  const cashFlows: { date: Date; amount: number }[] = sipTransfers.map((tx) => ({
    date: new Date(tx.date),
    amount: -tx.amount,
  }))

  cashFlows.push({ date: new Date(), amount: effectiveCurrentValue })

  return calculateXIRR(cashFlows)
}

/** Calculate investment duration in years. */
export function computeInvestmentDuration(sipTransfers: Array<{ date: string }>): number {
  if (sipTransfers.length === 0) return 0
  const firstDate = new Date(sipTransfers[0].date)
  const now = new Date()
  return (now.getTime() - firstDate.getTime()) / MS_PER_YEAR
}

/** Filter SIP transfer transactions for a given primary account. */
export function filterSipTransfers(
  transactions: Transaction[],
  primaryAccountName: string,
): Transaction[] {
  const lowerName = primaryAccountName.toLowerCase()
  return transactions
    .filter((tx) => tx.type === 'Transfer' && tx.to_account?.toLowerCase() === lowerName)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}

/**
 * Pre-compute gain/loss display classes and prefixes.
 *
 * The `realizedGains` pair of arguments was dropped along with the "Realized
 * Gain" card: its value was `currentBalance - totalHistoricalInvested`, and
 * since the balance is itself the sum of those contributions the result was a
 * rounding residue dressed up as a return.
 */
export function computeGainsDisplay(overrideGainsPercent: number, xirrPercent: number) {
  const positive = 'text-app-green'
  const negative = 'text-app-red'
  return {
    totalReturnColorClass: overrideGainsPercent >= 0 ? positive : negative,
    totalReturnSignPrefix: overrideGainsPercent >= 0 ? '+' : '',
    xirrColorClass: xirrPercent >= 0 ? positive : negative,
    xirrSignPrefix: xirrPercent >= 0 ? '+' : '',
  }
}
