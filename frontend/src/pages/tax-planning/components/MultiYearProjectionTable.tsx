import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { Sparkline } from '@/components/shared'
import { rawColors } from '@/constants/colors'
import type { ProjectedFYBreakdown } from '@/types/salary'

interface Props {
  projections: ProjectedFYBreakdown[]
}

const ROWS: Array<{
  label: string
  key: keyof ProjectedFYBreakdown
  colorClass: string
  trendColor: string
}> = [
  { label: 'Base Salary', key: 'baseSalary', colorClass: 'text-income', trendColor: rawColors.app.green },
  { label: 'Bonus', key: 'bonus', colorClass: 'text-income', trendColor: rawColors.app.green },
  { label: 'RSU Vesting', key: 'rsuIncome', colorClass: 'text-income', trendColor: rawColors.app.green },
  { label: 'EPF', key: 'epf', colorClass: 'text-muted-foreground', trendColor: rawColors.app.teal },
  { label: 'Other', key: 'otherTaxable', colorClass: 'text-muted-foreground', trendColor: rawColors.app.teal },
  { label: 'Gross Taxable', key: 'grossTaxable', colorClass: 'text-foreground', trendColor: rawColors.app.blue },
  { label: 'Total Tax', key: 'totalTax', colorClass: 'text-expense', trendColor: rawColors.app.red },
  { label: 'Take-Home', key: 'takeHome', colorClass: 'text-income', trendColor: rawColors.app.green },
]

/** First -> last CAGR-style total growth across the projection horizon. */
function totalGrowthPct(values: number[]): number | null {
  const first = values[0]
  const last = values.at(-1)
  if (first === undefined || last === undefined || first === 0) return null
  return ((last - first) / first) * 100
}

export default function MultiYearProjectionTable({ projections }: Readonly<Props>) {
  const rates = projections.map((p) => p.effectiveTaxRate)
  const rateGrowth = totalGrowthPct(rates)

  return (
    <div className="glass rounded-2xl border border-border p-4 md:p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-app-purple/20 rounded-xl">
          <TrendingUp className="w-5 h-5 text-app-purple" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Multi-Year Projection</h3>
          <p className="text-xs text-muted-foreground">
            {projections.length} year outlook based on salary structure and growth assumptions
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 px-3 text-muted-foreground font-medium max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-surface-dropdown">
                Component
              </th>
              {projections.map((p) => (
                <th
                  key={p.fy}
                  className="text-right py-2 px-3 text-muted-foreground font-medium whitespace-nowrap"
                >
                  FY {p.fy}
                  {p.isProjected && (
                    <span className="text-caption text-text-quaternary ml-1">*</span>
                  )}
                </th>
              ))}
              <th className="text-right py-2 px-3 text-muted-foreground font-medium whitespace-nowrap">
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const values = projections.map((p) => p[row.key] as number)
              const hasAnyValue = values.some((v) => v > 0)
              if (!hasAnyValue) return null
              const growth = totalGrowthPct(values)
              return (
                <tr key={row.key} className="border-b border-border/50">
                  <td className="py-2.5 px-3 font-medium text-foreground max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-surface-dropdown">
                    {row.label}
                  </td>
                  {projections.map((p, i) => (
                    <td key={p.fy} className={`py-2.5 px-3 text-right ${row.colorClass}`}>
                      {formatCurrency(values[i])}
                    </td>
                  ))}
                  <td className="py-2.5 px-3">
                    <div className="flex items-center justify-end gap-2">
                      {growth !== null && (
                        <span className="text-overline text-text-tertiary tabular-nums whitespace-nowrap">
                          {growth >= 0 ? '+' : ''}{growth.toFixed(0)}%
                        </span>
                      )}
                      <Sparkline
                        data={values}
                        variant="compact"
                        color={row.trendColor}
                        ariaLabel={`${row.label} trend across ${projections.length} fiscal years`}
                      />
                    </div>
                  </td>
                </tr>
              )
            })}
            <tr className="border-b border-border/50">
              <td className="py-2.5 px-3 font-medium text-foreground max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-surface-dropdown">
                Effective Tax Rate
              </td>
              {projections.map((p) => (
                <td key={p.fy} className="py-2.5 px-3 text-right text-muted-foreground tabular-nums">
                  {p.effectiveTaxRate.toFixed(1)}%
                </td>
              ))}
              <td className="py-2.5 px-3">
                <div className="flex items-center justify-end gap-2">
                  {rateGrowth !== null && (
                    <span className="text-overline text-text-tertiary tabular-nums whitespace-nowrap">
                      {rateGrowth >= 0 ? '+' : ''}{rateGrowth.toFixed(0)}%
                    </span>
                  )}
                  <Sparkline
                    data={rates}
                    variant="compact"
                    color={rawColors.app.orange}
                    ariaLabel={`Effective tax rate trend across ${projections.length} fiscal years`}
                  />
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-text-tertiary mt-3">
        * Projected values based on growth assumptions. Actual figures may vary.
      </p>
    </div>
  )
}
