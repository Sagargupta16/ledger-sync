import type { FIREInputDefaults } from '@/lib/fireCalculator'
import type { MonteCarloInputs, PotId } from '@/lib/finance/monteCarlo'

export const POT_IDS: readonly PotId[] = ['equity', 'debt', 'cash']

export const POT_COPY: Readonly<Record<PotId, { readonly label: string; readonly holds: string }>> = {
  equity: { label: 'Equity', holds: 'Stocks, mutual funds and other investments' },
  debt: { label: 'Debt', holds: 'PPF, EPF and fixed deposits' },
  cash: { label: 'Cash', holds: 'Bank and wallets, less cards and loans' },
}

export interface PotPlan {
  /** Starting balance in today's rupees. */
  readonly balance: number
  readonly returnPct: number
  readonly volatilityPct: number
}

/** Everything the Monte Carlo tab edits, in display units (percent as 12, not 0.12). */
export interface MonteCarloPlan {
  readonly currentAge: number
  readonly retireAge: number
  readonly endAge: number
  readonly annualSavings: number
  readonly annualSpending: number
  readonly inflationPct: number
  readonly inflationVolatilityPct: number
  readonly runs: number
  readonly seed: number
  readonly stress: boolean
  readonly drawdownPct: number
  readonly pots: Readonly<Record<PotId, PotPlan>>
}

export type PlanField = Exclude<keyof MonteCarloPlan, 'pots'>

/** Only what the user changed; everything else follows the ledger and the defaults. */
export interface PlanOverrides extends Partial<Omit<MonteCarloPlan, 'pots'>> {
  readonly pots?: Partial<Record<PotId, Partial<PotPlan>>>
}

/** INR assumptions, not forecasts: a broad equity index, EPF/PPF/FD-like debt, savings-account cash. */
export const POT_DEFAULTS: Readonly<Record<PotId, Omit<PotPlan, 'balance'>>> = {
  equity: { returnPct: 12, volatilityPct: 18 },
  debt: { returnPct: 7.5, volatilityPct: 3 },
  cash: { returnPct: 3.5, volatilityPct: 1 },
}

export const RUN_CHOICES: readonly number[] = [1_000, 5_000, 10_000]

export const AGE_LIMITS = { min: 18, maxCurrent: 80, maxRetire: 85, maxEnd: 100 } as const

const DEFAULTS = {
  currentAge: 30,
  retireAge: 45,
  endAge: 85,
  inflationPct: 6,
  inflationVolatilityPct: 1.5,
  runs: 5_000,
  seed: 2026,
  stress: false,
  drawdownPct: 30,
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * The plan the tab shows: the user's edits over the measured ledger (net worth
 * pots, yearly savings and spending) and the defaults. Ages are kept in order,
 * so a later age can never sit below an earlier one.
 */
export function buildPlan(
  balances: Readonly<Record<PotId, number>>,
  measured: FIREInputDefaults,
  overrides: PlanOverrides,
): MonteCarloPlan {
  const { pots: potOverrides, ...fields } = overrides
  const currentAge = clamp(fields.currentAge ?? DEFAULTS.currentAge, AGE_LIMITS.min, AGE_LIMITS.maxCurrent)
  const retireAge = clamp(fields.retireAge ?? DEFAULTS.retireAge, currentAge, AGE_LIMITS.maxRetire)
  const endAge = clamp(fields.endAge ?? DEFAULTS.endAge, retireAge + 1, AGE_LIMITS.maxEnd)
  const pot = (id: PotId): PotPlan => ({
    balance: Math.max(0, potOverrides?.[id]?.balance ?? Math.round(balances[id])),
    returnPct: potOverrides?.[id]?.returnPct ?? POT_DEFAULTS[id].returnPct,
    volatilityPct: potOverrides?.[id]?.volatilityPct ?? POT_DEFAULTS[id].volatilityPct,
  })
  return {
    ...DEFAULTS,
    ...fields,
    currentAge,
    retireAge,
    endAge,
    annualSavings: Math.max(0, fields.annualSavings ?? Math.round(measured.annualSavings)),
    annualSpending: Math.max(0, fields.annualSpending ?? Math.round(measured.annualExpenses)),
    pots: { equity: pot('equity'), debt: pot('debt'), cash: pot('cash') },
  }
}

/** The plan in the simulation's units: fractions, and the drawdown only when the stress test is on. */
export function toSimulationInputs(plan: MonteCarloPlan): MonteCarloInputs {
  return {
    pots: POT_IDS.map((id) => ({
      id,
      balance: plan.pots[id].balance,
      expectedReturn: plan.pots[id].returnPct / 100,
      volatility: plan.pots[id].volatilityPct / 100,
    })),
    currentAge: plan.currentAge,
    retireAge: plan.retireAge,
    endAge: plan.endAge,
    annualSavings: plan.annualSavings,
    annualSpending: plan.annualSpending,
    inflation: plan.inflationPct / 100,
    inflationVolatility: plan.inflationVolatilityPct / 100,
    runs: plan.runs,
    seed: plan.seed,
    equityDrawdown: plan.stress ? plan.drawdownPct / 100 : 0,
  }
}
