import { ChevronRight } from 'lucide-react'
import { motion } from 'motion/react'

import { formatCurrency } from '@/lib/formatters'

import type { TaxPlanningModel } from '../useTaxPlanning'
import RegimeComparison from './RegimeComparison'

interface Props {
  planning: TaxPlanningModel
}

export default function TaxRegimeComparisonSection({ planning }: Readonly<Props>) {
  if (!planning.newRegimeAvailable) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.14, duration: 0.2 }}
      className="ledger-panel p-4 md:p-6"
    >
      <div className="mb-4 flex items-start gap-3">
        <div className="rounded-md bg-app-purple/15 p-2.5">
          <ChevronRight className="size-5 text-app-purple" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3 className="text-base font-semibold">Which regime saves you more?</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Based on your income of {formatCurrency(planning.display.gross)}
          </p>
        </div>
      </div>

      <RegimeComparison
        grossIncome={planning.display.gross}
        fyYear={planning.fyYear}
        salaryMonthsCount={planning.useSalaryProjection ? 12 : planning.salaryMonthsCount}
        hasEmploymentIncome={planning.hasEmploymentIncome}
        employmentIncome={planning.useSalaryProjection
          ? planning.annualTaxComputation?.grossEmploymentIncome ?? planning.salaryProjection?.grossTaxable
          : planning.taxComputation.grossEmploymentIncome ?? undefined}
      />
    </motion.div>
  )
}
