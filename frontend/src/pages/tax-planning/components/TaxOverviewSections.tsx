import { ListTree, Receipt } from 'lucide-react'
import { motion } from 'framer-motion'

import EffectiveTaxRateChart from '@/components/analytics/EffectiveTaxRateChart'
import TaxableIncomeTable from '@/components/analytics/TaxableIncomeTable'
import TaxSlabBreakdown from '@/components/analytics/TaxSlabBreakdown'
import TaxSummaryCards from '@/components/analytics/TaxSummaryCards'
import TaxSummaryGrid from '@/components/analytics/TaxSummaryGrid'
import { CollapsibleSection } from '@/components/ui'
import { fadeUpItem } from '@/constants/animations'

import type { TaxPlanningModel } from '../useTaxPlanning'
import TdsScheduleChart from './TdsScheduleChart'

interface Props {
  planning: TaxPlanningModel
}

export default function TaxOverviewSections({ planning }: Readonly<Props>) {
  return (
    <>
      <motion.div variants={fadeUpItem}>
        <TaxSummaryCards
          isLoading={false}
          netTaxableIncome={planning.display.net}
          grossTaxableIncome={planning.cardOverride?.taxableIncome ?? planning.display.gross}
          taxAlreadyPaid={planning.cardOverride?.taxAlreadyPaid ?? planning.display.totalTax}
          isProjecting={planning.useSalaryProjection}
          prevNetTaxableIncome={planning.prevFYDisplay?.net}
          prevGrossTaxableIncome={planning.prevFYDisplay?.gross}
          prevTaxAlreadyPaid={planning.prevFYDisplay?.totalTax}
        />
      </motion.div>

      <motion.div variants={fadeUpItem}>
        <CollapsibleSection title="Tax Slab Breakdown" icon={ListTree} defaultExpanded={false}>
          <TaxSlabBreakdown
            isNewRegime={planning.isNewRegime}
            taxSlabs={planning.taxSlabs}
            slabBreakdown={planning.display.slabBreakdown}
            grossTaxableIncome={planning.display.gross}
            standardDeduction={planning.standardDeduction}
            fyYear={planning.fyYear}
            baseTax={planning.display.baseTax}
            rebate87A={planning.display.rebate87A}
            surcharge={planning.display.surcharge}
            cess={planning.display.cess}
            professionalTax={planning.display.professionalTax}
            totalTax={planning.display.totalTax}
            isProjecting={planning.useSalaryProjection}
          />
        </CollapsibleSection>
      </motion.div>

      <motion.div variants={fadeUpItem}>
        <TaxSummaryGrid
          selectedFY={planning.effectiveFY}
          grossTaxableIncome={planning.cardOverride?.taxableIncome ?? planning.display.gross}
          taxAlreadyPaid={planning.cardOverride?.taxAlreadyPaid ?? planning.display.totalTax}
          totalIncome={planning.display.income}
          totalExpense={planning.expense}
          isProjecting={planning.useSalaryProjection}
        />
      </motion.div>

      {planning.showTdsSchedule && planning.tdsSchedule.length > 0 && (
        <motion.div variants={fadeUpItem}>
          <TdsScheduleChart
            schedule={planning.tdsSchedule}
            monthsPaid={planning.salaryMonthsCount}
          />
        </motion.div>
      )}

      <EffectiveTaxRateChart
        taxSlabs={planning.taxSlabs}
        isNewRegime={planning.isNewRegime}
        fyYear={planning.fyYear}
        standardDeduction={planning.standardDeduction}
        currentIncome={planning.display.gross}
      />

      {!planning.useSalaryProjection && (
        <motion.div variants={fadeUpItem}>
          <CollapsibleSection title="Taxable Income Detail" icon={Receipt} defaultExpanded={false}>
            <TaxableIncomeTable
              selectedFY={planning.effectiveFY}
              incomeGroups={planning.currentFYData?.incomeGroups}
              netTaxableIncome={planning.netTaxableIncome}
            />
          </CollapsibleSection>
        </motion.div>
      )}
    </>
  )
}
