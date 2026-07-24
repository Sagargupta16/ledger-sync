import { Money } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import type { TaxSlab, SlabBreakdownEntry } from '@/lib/taxCalculator'

interface TaxSlabBreakdownProps {
  isNewRegime: boolean
  taxSlabs: TaxSlab[]
  slabBreakdown: SlabBreakdownEntry[]
  grossTaxableIncome: number
  standardDeduction: number
  fyYear: number
  baseTax: number
  rebate87A?: number
  surcharge?: number
  cess: number
  professionalTax: number
  totalTax: number
  isProjecting?: boolean
}

export default function TaxSlabBreakdown({
  isNewRegime,
  taxSlabs,
  slabBreakdown,
  grossTaxableIncome,
  standardDeduction,
  fyYear,
  baseTax,
  rebate87A = 0,
  surcharge = 0,
  cess,
  professionalTax,
  totalTax,
  isProjecting = false,
}: Readonly<TaxSlabBreakdownProps>) {
  return (
    <div>
      <p className="text-sm font-medium text-muted-foreground mb-4">
        {isNewRegime ? 'Tax Slabs (FY 2025-26 Onwards)' : 'Tax Slabs (Before FY 2025-26)'}
      </p>

      {/* Standard Deduction Info */}
      <div className="mb-4 p-3 bg-app-blue/10 border border-app-blue/30 rounded-lg">
        <p className="text-sm text-app-blue">
          Standard Deduction:{' '}
          <span className="font-semibold">{formatCurrency(standardDeduction)}</span>
          {fyYear >= 2024 ? ' (from FY 2024-25)' : ' (before FY 2024-25)'}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Tax calculated on: {formatCurrency(grossTaxableIncome)} (After standard deduction)
        </p>
      </div>

      <section
        className="overflow-x-auto"
        aria-label={`${isNewRegime ? 'New' : 'Old'} regime tax slab calculation`}
      >
        <table className="w-full">
          <caption className="sr-only">
            Tax slab calculation under the {isNewRegime ? 'new' : 'old'} tax regime
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th
                scope="col"
                className="hidden sm:table-cell text-right py-3 px-4 text-sm font-semibold text-foreground"
              >
                Lower Limit
              </th>
              <th
                scope="col"
                className="text-left sm:text-right py-3 px-2 sm:px-4 text-sm font-semibold text-foreground"
              >
                <span className="sm:hidden">Slab</span>
                <span className="hidden sm:inline">Upper Limit</span>
              </th>
              <th
                scope="col"
                className="text-right py-3 px-2 sm:px-4 text-sm font-semibold text-foreground whitespace-nowrap"
              >
                Tax %
              </th>
              <th
                scope="col"
                className="text-right py-3 px-2 sm:px-4 text-sm font-semibold text-foreground whitespace-nowrap"
              >
                Tax Amount
              </th>
            </tr>
          </thead>
          <tbody>
            {taxSlabs.map((slab) => {
              const breakdown = slabBreakdown.find((b) => b.slab === slab)
              const taxAmount = breakdown?.taxAmount || 0
              const isApplicable = grossTaxableIncome > slab.lower

              return (
                <tr
                  key={`${slab.lower}-${slab.upper}`}
                  className={`border-b border-border ${isApplicable ? 'bg-primary/5' : ''}`}
                >
                  <td className="hidden sm:table-cell py-3 px-4 text-right">
                    <Money value={slab.lower} />
                  </td>
                  <th
                    scope="row"
                    className="py-3 px-2 sm:px-4 text-left sm:text-right font-normal text-foreground tabular-nums"
                  >
                    {slab.upper === Infinity ? (
                      <span className="whitespace-nowrap">Above</span>
                    ) : (
                      <Money value={slab.upper} />
                    )}
                    <span className="sm:hidden block whitespace-nowrap text-xs text-muted-foreground">
                      from {formatCurrency(slab.lower)}
                    </span>
                  </th>
                  <td className="py-3 px-2 sm:px-4 text-right text-foreground font-semibold tabular-nums whitespace-nowrap">
                    {slab.rate.toFixed(2)}%
                  </td>
                  <td className="py-3 px-2 sm:px-4 text-right">
                    <Money
                      value={isApplicable ? taxAmount : 0}
                      bold
                      className="text-primary"
                    />
                  </td>
                </tr>
              )
            })}
            <tr className="border-t border-border">
              <th
                scope="row"
                colSpan={3}
                className="py-3 px-2 sm:px-4 text-right font-semibold text-foreground"
              >
                Tax on Base:
              </th>
              <td className="py-3 px-2 sm:px-4 text-right">
                <Money value={baseTax} bold />
              </td>
            </tr>
            {rebate87A > 0 && (
              <tr className="border-b border-border">
                <th
                  scope="row"
                  colSpan={3}
                  className="py-3 px-2 sm:px-4 text-right text-sm font-normal text-app-green"
                >
                  - Section 87A Rebate:
                </th>
                <td className="py-3 px-2 sm:px-4 text-right text-sm">
                  <Money
                    value={rebate87A}
                    formatter={(value) => `-${formatCurrency(value)}`}
                    className="text-app-green"
                  />
                </td>
              </tr>
            )}
            {surcharge > 0 && (
              <tr className="border-b border-border">
                <th
                  scope="row"
                  colSpan={3}
                  className="py-3 px-2 sm:px-4 text-right text-sm font-normal text-muted-foreground"
                >
                  + Surcharge:
                </th>
                <td className="py-3 px-2 sm:px-4 text-right text-sm">
                  <Money value={surcharge} />
                </td>
              </tr>
            )}
            <tr className="border-b border-border">
              <th
                scope="row"
                colSpan={3}
                className="py-3 px-2 sm:px-4 text-right text-sm font-normal text-muted-foreground"
              >
                + Health & Education Cess (4%):
              </th>
              <td className="py-3 px-2 sm:px-4 text-right text-sm">
                <Money value={cess} />
              </td>
            </tr>
            <tr className="border-b border-border">
              <th
                scope="row"
                colSpan={3}
                className="py-3 px-2 sm:px-4 text-right text-sm font-normal text-muted-foreground"
              >
                + Professional Tax:
              </th>
              <td className="py-3 px-2 sm:px-4 text-right text-sm">
                <Money value={professionalTax} />
              </td>
            </tr>
            <tr className="border-t-2 border-primary/30">
              <th
                scope="row"
                colSpan={3}
                className="py-4 px-2 sm:px-4 text-right text-base font-bold text-foreground"
              >
                {isProjecting ? 'Total Estimated Tax:' : 'Total Tax Already Paid:'}
              </th>
              <td className="py-4 px-2 sm:px-4 text-right text-base">
                <Money value={totalTax} bold className="text-primary" />
              </td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  )
}
