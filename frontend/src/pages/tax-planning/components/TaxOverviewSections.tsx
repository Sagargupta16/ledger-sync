import { ListTree, Receipt } from 'lucide-react'
import { motion } from 'motion/react'

import EffectiveTaxRateChart from '@/components/analytics/EffectiveTaxRateChart'
import TaxableIncomeTable from '@/components/analytics/TaxableIncomeTable'
import TaxSlabBreakdown from '@/components/analytics/TaxSlabBreakdown'
import TaxSummaryCards from '@/components/analytics/TaxSummaryCards'
import TaxSummaryGrid from '@/components/analytics/TaxSummaryGrid'
import { CollapsibleSection, Money } from '@/components/ui'
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
          grossTaxableIncome={planning.display.gross}
          totalTax={planning.display.totalTax}
          isProjecting={planning.useSalaryProjection}
          prevNetTaxableIncome={planning.useSalaryProjection ? null : planning.prevFYDisplay?.net}
          prevGrossTaxableIncome={planning.prevFYDisplay?.gross}
          prevTotalTax={planning.prevFYDisplay?.totalTax}
        />
      </motion.div>

      {planning.salaryProjection && (
        <section aria-label="Cash and RSU compensation" className="ledger-panel p-4 sm:p-5">
          <h2 className="text-base font-semibold">Cash and retained shares</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Employment compensation only. RSUs are taxed on the gross vest; retained shares remain invested.
            The annual tax estimate also includes other taxable income recorded for this year.
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Net share value</dt>
              <dd className="mt-1 text-lg"><Money value={planning.salaryProjection.netShareValue} bold /></dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Share tax withholding</dt>
              <dd className="mt-1 text-lg"><Money value={planning.salaryProjection.rsuWithholding} bold /></dd>
              <dd className="mt-1 text-xs leading-5 text-muted-foreground">
                <Money value={planning.salaryProjection.rsuRecordedWithholding} /> recorded;
                {' '}<Money value={planning.salaryProjection.rsuEstimatedWithholding} /> estimated
              </dd>
            </div>
            <div className="min-w-0">
              <dt className="text-xs text-muted-foreground">Cash + net share value</dt>
              <dd className="mt-1 text-lg"><Money value={planning.salaryProjection.netCompensation} bold /></dd>
              <dd className="mt-1 text-xs text-muted-foreground">Combined net compensation</dd>
            </div>
          </dl>
        </section>
      )}

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
          grossTaxableIncome={planning.display.gross}
          totalTax={planning.display.totalTax}
          totalIncome={planning.display.income}
          metrics={planning.overviewMetrics}
          isProjecting={planning.useSalaryProjection}
        />
      </motion.div>

      {planning.showTdsSchedule && planning.tdsSchedule.length > 0 && (
        <motion.div variants={fadeUpItem}>
          <TdsScheduleChart
            schedule={planning.tdsSchedule}
            paidMonthIndices={planning.paidMonthIndices}
            paidEstimate={planning.paidTaxEstimate}
          />
        </motion.div>
      )}

      <EffectiveTaxRateChart
        taxSlabs={planning.taxSlabs}
        isNewRegime={planning.isNewRegime}
        fyYear={planning.fyYear}
        currentIncome={planning.display.gross}
        currentTax={planning.display.totalTax}
        hasEmploymentIncome={planning.hasEmploymentIncome}
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
