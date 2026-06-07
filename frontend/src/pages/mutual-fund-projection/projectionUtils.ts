import { accountClassificationsService } from '@/services/api/accountClassifications'
import { calculateXIRR } from '@/lib/xirr'
import { MS_PER_YEAR } from '@/lib/dateUtils'
import type { Transaction } from '@/types'

import type { ChartDataPoint, MutualFundAccount } from './types'

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

/** Build historical chart data from SIP transfers. */
export function buildHistoricalChartData(
  sipTransfers: Array<{ date: string; amount: number }>,
  effectiveCurrentValue: number,
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

  Array.from(monthlyInvested.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([monthKey, invested]) => {
      const [year, month] = monthKey.split('-')
      const date = new Date(Number.parseInt(year), Number.parseInt(month) - 1)
      const monthLabel = date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

      const proportionalValue = totalInvested > 0
        ? invested + (invested / totalInvested) * totalGains
        : invested

      data.push({
        month: monthLabel,
        invested: Math.round(invested),
        value: Math.round(proportionalValue),
        isHistorical: true,
      })
    })

  return data
}

/** Build projection chart data from the last historical data point. */
export function buildProjectionChartData(
  lastHistorical: ChartDataPoint,
  lastDate: Date,
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
    const futureDate = new Date(lastDate)
    futureDate.setMonth(lastDate.getMonth() + i)
    const monthLabel = futureDate.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })

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
    const note = (tx.note || '').toLowerCase()
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
    ?.accounts || {}

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

  return growAccount || mutualFundAccounts[0]
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

  const historicalData = buildHistoricalChartData(sipTransfers, effectiveCurrentValue)

  if (historicalData.length === 0) return historicalData

  const lastHistorical = historicalData.at(-1)
  if (!lastHistorical) return historicalData
  const lastSipTransfer = sipTransfers.at(-1)
  if (!lastSipTransfer) return historicalData
  const lastDate = new Date(lastSipTransfer.date)
  const projectionData = buildProjectionChartData(
    lastHistorical,
    lastDate,
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

/** Pre-compute gain/loss display classes and prefixes. */
export function computeGainsDisplay(
  realizedGains: number,
  realizedGainsPercent: number,
  overrideGainsPercent: number,
  xirrPercent: number,
) {
  const positive = 'text-app-green'
  const negative = 'text-app-red'
  return {
    gainsBgClass:
      realizedGains >= 0 ? 'bg-app-green/20 shadow-app-green/30' : 'bg-app-red/20 shadow-app-red/30',
    gainsIconClass: realizedGains >= 0 ? positive : negative,
    gainsTextClass: realizedGains >= 0 ? 'text-app-green' : 'text-app-red',
    gainsSignPrefix: realizedGainsPercent >= 0 ? '+' : '',
    totalReturnColorClass: overrideGainsPercent >= 0 ? positive : negative,
    totalReturnSignPrefix: overrideGainsPercent >= 0 ? '+' : '',
    xirrColorClass: xirrPercent >= 0 ? positive : negative,
    xirrSignPrefix: xirrPercent >= 0 ? '+' : '',
  }
}
