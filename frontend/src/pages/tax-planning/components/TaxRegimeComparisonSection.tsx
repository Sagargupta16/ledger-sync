import { ChevronRight } from 'lucide-react'
import { motion } from 'framer-motion'

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
      transition={{ delay: 0.35 }}
      className="glass rounded-2xl border border-border p-4 md:p-6"
    >
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2.5 bg-app-purple/20 rounded-xl">
          <ChevronRight className="w-5 h-5 text-app-purple" />
        </div>
        <div>
          <h3 className="text-lg font-semibold">Which Regime Saves You More?</h3>
          <p className="text-xs text-muted-foreground">
            Based on your income of {formatCurrency(planning.display.gross)}
          </p>
        </div>
      </div>

      <RegimeComparison
        grossIncome={planning.display.gross}
        fyYear={planning.fyYear}
        standardDeduction={planning.standardDeduction}
        salaryMonthsCount={planning.salaryMonthsCount}
      />
    </motion.div>
  )
}
