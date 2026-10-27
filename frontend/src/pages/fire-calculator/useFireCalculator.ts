import { useMemo, useState } from 'react'

import { computeFIRE, computeRetirementCorpus, type FIREInputDefaults } from '@/lib/fireCalculator'

/**
 * The deterministic FIRE and Retirement tabs: their slider state and results.
 * Called by the page rather than the panels, so the values survive a tab switch.
 */
export function useFireAssumptions(autoValues: FIREInputDefaults) {
  const [swr, setSwr] = useState(3)
  const [realReturn, setRealReturn] = useState(6)
  const [yearsToRetire, setYearsToRetire] = useState(25)
  // Barista FIRE: expected part-time / passion-work MONTHLY income after
  // leaving full-time work. Default 0 = no assumed side income (pure FIRE).
  const [baristaMonthlyIncome, setBaristaMonthlyIncome] = useState(0)

  const result = useMemo(() => computeFIRE({
    annualExpenses: autoValues.annualExpenses,
    essentialAnnualExpenses: autoValues.essentialAnnualExpenses,
    annualSavings: autoValues.annualSavings,
    annualIncome: autoValues.annualIncome,
    swr: swr / 100,
    realReturn: realReturn / 100,
    yearsToRetire,
    baristaAnnualIncome: baristaMonthlyIncome * 12,
  }), [autoValues, swr, realReturn, yearsToRetire, baristaMonthlyIncome])

  return {
    swr, setSwr, realReturn, setRealReturn, yearsToRetire, setYearsToRetire,
    baristaMonthlyIncome, setBaristaMonthlyIncome, result,
  }
}

export function useRetirementAssumptions(autoValues: FIREInputDefaults, swr: number) {
  const [inflation, setInflation] = useState(6.5)
  const [expectedReturn, setExpectedReturn] = useState(12)
  const [retirementYears, setRetirementYears] = useState(25)

  const result = useMemo(() => computeRetirementCorpus({
    monthlyExpenses: autoValues.monthlyExpenses,
    inflationRate: inflation / 100,
    expectedReturn: expectedReturn / 100,
    yearsToRetirement: retirementYears,
    swr: swr / 100,
  }), [autoValues.monthlyExpenses, inflation, expectedReturn, retirementYears, swr])

  return {
    inflation, setInflation, expectedReturn, setExpectedReturn,
    retirementYears, setRetirementYears, result,
  }
}

export type FireAssumptions = ReturnType<typeof useFireAssumptions>
export type RetirementAssumptions = ReturnType<typeof useRetirementAssumptions>
