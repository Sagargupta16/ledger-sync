import { TrendingUp } from 'lucide-react'

import { Sparkline } from '@/components/shared'
import { Money } from '@/components/ui'
import { rawColors } from '@/constants/colors'
import { percentChange } from '@/lib/formatters'
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
  { label: 'Employee EPF', key: 'epf', colorClass: 'text-muted-foreground', trendColor: rawColors.app.teal },
  { label: 'Other', key: 'otherTaxable', colorClass: 'text-muted-foreground', trendColor: rawColors.app.teal },
  { label: 'Gross Taxable', key: 'grossTaxable', colorClass: 'text-foreground', trendColor: rawColors.app.blue },
  { label: 'Total Tax', key: 'totalTax', colorClass: 'text-expense', trendColor: rawColors.app.red },
  { label: 'Share tax withholding', key: 'rsuWithholding', colorClass: 'text-expense', trendColor: rawColors.app.red },
  { label: 'Cash take-home', key: 'cashTakeHome', colorClass: 'text-income', trendColor: rawColors.app.green },
  { label: 'Retained share value', key: 'netShareValue', colorClass: 'text-income', trendColor: rawColors.app.teal },
  { label: 'Combined net compensation', key: 'netCompensation', colorClass: 'text-income', trendColor: rawColors.app.green },
]

/** Total change across the projection horizon, not an annualized return. */
function totalGrowthPct(values: number[]): number | null {
  const first = values[0]
  const last = values.at(-1)
  if (first === undefined || last === undefined || first === 0) return null
  return percentChange(last, first)
}

export default function MultiYearProjectionTable({ projections }: Readonly<Props>) {
  const rates = projections.map((p) => p.effectiveTaxRate)
  const rateGrowth = totalGrowthPct(rates)

  return (
    <div className="ledger-panel p-4 md:p-6">
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md bg-app-purple/15 p-2.5">
          <TrendingUp className="size-5 text-app-purple" aria-hidden />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Multi-year projection</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {projections.length} year outlook based on salary structure and growth assumptions
          </p>
        </div>
      </div>

      <section
        className="relative overflow-x-auto overscroll-x-contain rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        aria-label="Multi-year salary and tax projection"
      >
        <table
          className="w-full min-w-max text-sm"
          aria-describedby="multi-year-projection-note"
        >
          <caption className="sr-only">
            Multi-year salary and tax projection by fiscal year
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="text-left py-2 px-3 text-muted-foreground font-medium max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-surface-dropdown max-sm:max-w-28 max-sm:text-xs max-sm:whitespace-normal"
              >
                Component
              </th>
              {projections.map((p) => (
                <th
                  key={p.fy}
                  scope="col"
                  className="text-right py-2 px-3 text-muted-foreground font-medium whitespace-nowrap"
                >
                  FY {p.fy}
                  {p.isProjected && (
                    <>
                      <span className="text-caption text-text-quaternary ml-1" aria-hidden>
                        *
                      </span>
                      <span className="sr-only"> projected</span>
                    </>
                  )}
                </th>
              ))}
              <th
                scope="col"
                className="hidden sm:table-cell text-right py-2 px-3 text-muted-foreground font-medium whitespace-nowrap"
              >
                Trend
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const values = projections.map((p) => p[row.key] as number)
              const hasAnyValue = values.some((v) => v !== 0)
              if (!hasAnyValue) return null
              const growth = totalGrowthPct(values)
              return (
                <tr key={row.key} className="border-b border-border/50">
                  <th
                    scope="row"
                    className="py-2.5 px-3 text-left font-medium text-foreground max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-surface-dropdown max-sm:max-w-28 max-sm:text-xs max-sm:whitespace-normal"
                  >
                    {row.label}
                  </th>
                  {projections.map((p, i) => (
                    <td key={p.fy} className={`py-2.5 px-3 text-right ${row.colorClass}`}>
                      <Money value={values[i]} className={row.colorClass} />
                    </td>
                  ))}
                  <td className="hidden sm:table-cell py-2.5 px-3">
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
              <th
                scope="row"
                className="py-2.5 px-3 text-left font-medium text-foreground max-sm:sticky max-sm:left-0 max-sm:z-10 max-sm:bg-surface-dropdown max-sm:max-w-28 max-sm:text-xs max-sm:whitespace-normal"
              >
                Effective Tax Rate
              </th>
              {projections.map((p) => (
                <td
                  key={p.fy}
                  className="py-2.5 px-3 text-right text-muted-foreground tabular-nums whitespace-nowrap"
                >
                  {p.effectiveTaxRate.toFixed(1)}%
                </td>
              ))}
              <td className="hidden sm:table-cell py-2.5 px-3">
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
      </section>

      <p id="multi-year-projection-note" className="text-xs text-text-tertiary mt-3">
        * Projected values based on growth assumptions. Actual figures may vary.
      </p>
    </div>
  )
}
