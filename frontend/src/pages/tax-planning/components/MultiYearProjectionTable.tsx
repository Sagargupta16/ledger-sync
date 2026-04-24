import { TrendingUp } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import type { ProjectedFYBreakdown } from '@/types/salary'

interface Props {
  projections: ProjectedFYBreakdown[]
}

const ROWS: Array<{ label: string; key: keyof ProjectedFYBreakdown; colorClass: string }> = [
  { label: 'Base Salary', key: 'baseSalary', colorClass: 'text-income' },
  { label: 'Bonus', key: 'bonus', colorClass: 'text-income' },
  { label: 'RSU Vesting', key: 'rsuIncome', colorClass: 'text-income' },
  { label: 'EPF', key: 'epf', colorClass: 'text-muted-foreground' },
  { label: 'Other', key: 'otherTaxable', colorClass: 'text-muted-foreground' },
  { label: 'Gross Taxable', key: 'grossTaxable', colorClass: 'text-foreground' },
  { label: 'Total Tax', key: 'totalTax', colorClass: 'text-expense' },
  { label: 'Take-Home', key: 'takeHome', colorClass: 'text-income' },
]

export default function MultiYearProjectionTable({ projections }: Readonly<Props>) {
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
              <th className="text-left py-2 px-3 text-muted-foreground font-medium">Component</th>
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
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => {
              const hasAnyValue = projections.some((p) => (p[row.key] as number) > 0)
              if (!hasAnyValue) return null
              return (
                <tr key={row.key} className="border-b border-border/50">
                  <td className="py-2.5 px-3 font-medium text-foreground">{row.label}</td>
                  {projections.map((p) => (
                    <td key={p.fy} className={`py-2.5 px-3 text-right ${row.colorClass}`}>
                      {formatCurrency(p[row.key] as number)}
                    </td>
                  ))}
                </tr>
              )
            })}
            <tr className="border-b border-border/50">
              <td className="py-2.5 px-3 font-medium text-foreground">Effective Tax Rate</td>
              {projections.map((p) => (
                <td key={p.fy} className="py-2.5 px-3 text-right text-muted-foreground">
                  {p.effectiveTaxRate.toFixed(1)}%
                </td>
              ))}
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
