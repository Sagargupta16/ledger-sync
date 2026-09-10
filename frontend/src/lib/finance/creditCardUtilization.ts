export type CreditCardUtilizationStatus = 'low' | 'medium' | 'high' | 'critical'

interface CardBase {
  readonly name: string
  /** Outstanding debt, not the signed ledger balance; null when unavailable. */
  readonly balance: number | null
}

export interface MeasuredCreditCard extends CardBase {
  readonly balance: number
  readonly creditLimit: number
  readonly utilization: number
  readonly availableCredit: number
  readonly status: CreditCardUtilizationStatus
}

export interface UnmeasuredCreditCard extends CardBase {
  readonly creditLimit: number | null
  readonly utilization: null
  readonly availableCredit: null
  readonly status: 'unknown'
}

export type CreditCardAccount = MeasuredCreditCard | UnmeasuredCreditCard

export interface CreditCardCoverageGap {
  readonly noLimit: number
  readonly zeroLimit: number
  readonly unavailable: number
}

export interface CreditCardTotals {
  readonly measured: readonly MeasuredCreditCard[]
  readonly unmeasuredCount: number
  readonly gap: CreditCardCoverageGap
  /** Sum of known outstanding debt, including cards without a usable limit. */
  readonly totalBalance: number
  readonly measuredBalance: number
  readonly measuredLimit: number
  readonly overallUtilization: number | null
  readonly isElevated: boolean
}

function resolveCreditLimit(configured: number | undefined): number | null {
  if (configured === undefined || !Number.isFinite(configured) || configured < 0) return null
  return configured
}

export function getCreditCardUtilizationStatus(utilization: number): CreditCardUtilizationStatus {
  if (utilization > 75) return 'critical'
  if (utilization > 50) return 'high'
  if (utilization > 30) return 'medium'
  return 'low'
}

/**
 * The account-balances API is signed: negative means owed, positive means a
 * prepaid asset. A credit on one card never becomes debt or offsets another
 * card's debt. Available credit measures headroom within the configured limit.
 */
export function buildCreditCardAccount(
  name: string,
  signedBalance: number,
  configuredLimit?: number,
): CreditCardAccount {
  const balance = Number.isFinite(signedBalance) ? Math.max(0, -signedBalance) : null
  const creditLimit = resolveCreditLimit(configuredLimit)
  if (balance === null || creditLimit === null || creditLimit <= 0) {
    return { name, balance, creditLimit, utilization: null, availableCredit: null, status: 'unknown' }
  }

  const utilization = (balance / creditLimit) * 100
  return {
    name,
    balance,
    creditLimit,
    utilization,
    availableCredit: Math.max(0, creditLimit - balance),
    status: getCreditCardUtilizationStatus(utilization),
  }
}

/** The aggregate numerator and denominator cover the same measurable cards. */
export function summarizeCreditCards(creditCards: readonly CreditCardAccount[]): CreditCardTotals {
  const measured = creditCards.filter((c): c is MeasuredCreditCard => c.utilization !== null)
  const unmeasured = creditCards.filter((c) => c.utilization === null)
  const gap: CreditCardCoverageGap = {
    noLimit: unmeasured.filter((c) => c.balance !== null && c.creditLimit === null).length,
    zeroLimit: unmeasured.filter((c) => c.balance !== null && c.creditLimit === 0).length,
    unavailable: unmeasured.filter((c) => c.balance === null).length,
  }
  const measuredBalance = measured.reduce((sum, c) => sum + c.balance, 0)
  const measuredLimit = measured.reduce((sum, c) => sum + c.creditLimit, 0)
  const overallUtilization = measuredLimit > 0 ? (measuredBalance / measuredLimit) * 100 : null

  return {
    measured,
    unmeasuredCount: unmeasured.length,
    gap,
    totalBalance: creditCards.reduce((sum, c) => sum + (c.balance ?? 0), 0),
    measuredBalance,
    measuredLimit,
    overallUtilization,
    isElevated: overallUtilization !== null && overallUtilization > 50,
  }
}
