import { useCallback, useMemo, useState } from 'react'

import type { FIREInputDefaults } from '@/lib/fireCalculator'
import type { PotId } from '@/lib/finance/monteCarlo'

import {
  buildPlan,
  toSimulationInputs,
  type MonteCarloPlan,
  type PlanField,
  type PlanOverrides,
  type PotPlan,
} from './monteCarloPlan'
import { useMonteCarloRunner } from './useMonteCarloRunner'
import { useMonteCarloSeed } from './useMonteCarloSeed'

/**
 * What the Monte Carlo tab keeps across a tab switch: the user's edits, held as
 * overrides over the measured ledger, and the runner with its last result.
 * Called by the page; the tab's panel builds the plan from it.
 */
export function useMonteCarloSession() {
  const [overrides, setOverrides] = useState<PlanOverrides>({})
  const runner = useMonteCarloRunner()
  return { overrides, setOverrides, runner }
}

export type MonteCarloSession = ReturnType<typeof useMonteCarloSession>

/**
 * The Monte Carlo tab's plan and actions. Called by the panel, so the balance
 * queries behind the pots start only once the tab is opened. Seeded values keep
 * following the data until the user changes a field, Reset returns to the data,
 * and nothing runs until every seed source has loaded.
 */
export function useMonteCarloPlan({ overrides, setOverrides, runner }: MonteCarloSession, measured: FIREInputDefaults) {
  const seedState = useMonteCarloSeed()
  const balances = seedState.seed.balances
  const plan = useMemo(() => buildPlan(balances, measured, overrides), [balances, measured, overrides])
  const inputs = useMemo(() => toSimulationInputs(plan), [plan])
  const { run: runInputs, ...last } = runner
  const canRun = !seedState.isLoading && seedState.failed.length === 0
  // A run in flight replaces the result, so the result is not stale until it settles.
  const isStale = last.status !== 'running'
    && last.resultInputs !== null
    && JSON.stringify(last.resultInputs) !== JSON.stringify(inputs)

  const setField = useCallback(<K extends PlanField>(key: K, value: MonteCarloPlan[K]) => {
    setOverrides((prev) => ({ ...prev, [key]: value }))
  }, [setOverrides])
  const setPotField = useCallback((pot: PotId, key: keyof PotPlan, value: number) => {
    setOverrides((prev) => ({ ...prev, pots: { ...prev.pots, [pot]: { ...prev.pots?.[pot], [key]: value } } }))
  }, [setOverrides])
  const reset = useCallback(() => setOverrides({}), [setOverrides])
  const run = useCallback(() => {
    if (canRun) runInputs(inputs)
  }, [canRun, runInputs, inputs])
  // A new seed draws a new sample of the same model, run at once so the change is visible.
  const reshuffle = useCallback(() => {
    if (!canRun) return
    const seed = inputs.seed + 1
    setOverrides((prev) => ({ ...prev, seed }))
    runInputs({ ...inputs, seed })
  }, [canRun, runInputs, inputs, setOverrides])

  return {
    plan,
    netWorth: seedState.seed.netWorth,
    seedLoading: seedState.isLoading,
    /** Seed sources that did not load; running waits for all of them. */
    seedFailed: seedState.failed,
    retrySeed: seedState.retry,
    canRun,
    ...last,
    isStale,
    hasEdits: Object.keys(overrides).length > 0,
    setField,
    setPotField,
    reset,
    run,
    reshuffle,
  }
}

export type MonteCarloPlanState = ReturnType<typeof useMonteCarloPlan>
