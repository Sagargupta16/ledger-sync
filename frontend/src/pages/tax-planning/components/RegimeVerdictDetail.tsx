import { formatCurrency } from '@/lib/formatters'

interface Props {
  newIsBetter: boolean
  totalDeductions: number
  breakEvenDeduction: number
  grossIncome: number
}

export default function RegimeVerdictDetail({
  newIsBetter,
  totalDeductions,
  breakEvenDeduction,
  grossIncome,
}: Readonly<Props>) {
  if (newIsBetter && totalDeductions === 0 && breakEvenDeduction > 0) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        Old Regime becomes better only if you claim at least{' '}
        <span className="font-semibold text-foreground">{formatCurrency(breakEvenDeduction)}</span>{' '}
        in deductions (80C + 80D + HRA + 24b etc). Enter your deductions above to check.
      </p>
    )
  }

  if (newIsBetter && breakEvenDeduction === 0 && grossIncome > 500000) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        At your income level, New Regime is better even with maximum Old Regime deductions.
      </p>
    )
  }

  if (newIsBetter && totalDeductions > 0) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        Even with {formatCurrency(totalDeductions)} in deductions, New Regime is cheaper. You need{' '}
        {formatCurrency(Math.max(0, breakEvenDeduction - totalDeductions))} more in deductions for
        Old Regime to win.
      </p>
    )
  }

  if (!newIsBetter) {
    return (
      <p className="text-sm mt-2 text-muted-foreground">
        {totalDeductions > 0
          ? `With ${formatCurrency(totalDeductions)} in deductions, Old Regime saves you more. Make sure to claim all these deductions when filing.`
          : "The Old Regime's higher slab rates are offset by deductions available. Enter your deductions above to see exact savings."}
      </p>
    )
  }

  return null
}
