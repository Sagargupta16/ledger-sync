export interface SIPProjectionInputs {
  monthlySIP: number
  annualRate: number
  years: number
  sipGrowthRate: number
  startingCorpus: number
  /** Cost basis carried into invested totals; it can differ from today's corpus. */
  initialInvested: number
}

export interface SIPProjectionMonth {
  month: number
  value: number
  invested: number
}

export interface SIPProjectionResult {
  months: SIPProjectionMonth[]
  summary: { value: number; invested: number; returns: number }
}

function nominalMonthlyRate(annualRate: number): number {
  return annualRate / 12 / 100
}

/**
 * Nominal annual percentage / 12, with contributions before each month's return.
 * A positive annual SIP step-up applies after every twelve contributions.
 * Amounts stay unrounded and in the caller's currency throughout the projection.
 */
export function projectMonthlySIP({
  monthlySIP,
  annualRate,
  years,
  sipGrowthRate,
  startingCorpus,
  initialInvested,
}: Readonly<SIPProjectionInputs>): SIPProjectionResult {
  const monthlyRate = nominalMonthlyRate(annualRate)
  const months: SIPProjectionMonth[] = []
  let invested = initialInvested
  let value = startingCorpus
  let currentSIP = monthlySIP

  for (let month = 1; month <= years * 12; month++) {
    invested += currentSIP
    value = (value + currentSIP) * (1 + monthlyRate)
    months.push({ month, value, invested })

    if (month % 12 === 0 && sipGrowthRate > 0) {
      currentSIP *= 1 + sipGrowthRate / 100
    }
  }

  return {
    months,
    summary: { value, invested, returns: value - invested },
  }
}

/** Allocate today's gains/losses by contributed principal, not observed prices. */
export function allocateHistoricalSIPValue(
  invested: number,
  totalInvested: number,
  currentValue: number,
): number {
  return totalInvested > 0
    ? invested + (invested / totalInvested) * (currentValue - totalInvested)
    : invested
}

/**
 * Compound each contribution over elapsed calendar months, using numeric month
 * indices supplied by the adapter. Its own month earns zero interest, unlike
 * the forward projection's start-of-month contribution. Future amounts are omitted.
 */
export function calculateSIPBenchmarkValue(
  contributionsByMonth: ReadonlyMap<number, number>,
  month: number,
  annualRate: number,
): number {
  const monthlyRate = nominalMonthlyRate(annualRate)
  let value = 0
  for (const [contributionMonth, amount] of contributionsByMonth) {
    if (contributionMonth > month) continue
    value += amount * (1 + monthlyRate) ** (month - contributionMonth)
  }
  return value
}
