import { motion } from 'motion/react'
import { Calculator } from 'lucide-react'

import StandardAreaChart from '@/components/analytics/StandardAreaChart'
import MetricCard from '@/components/shared/MetricCard'
import { currencyTooltipFormatter } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { fadeUpItem } from '@/constants/animations'

import type { RetirementAssumptions } from '../useFireCalculator'
import SliderInput from './SliderInput'

/** The deterministic Retirement tab: required corpus, SIP, the growth chart and its sliders. */
export default function RetirementPanel({ retirement }: Readonly<{ retirement: RetirementAssumptions }>) {
  const { inflation, expectedReturn, retirementYears, result: retirementResult } = retirement
  return (
    <div role="tabpanel" id="retirement-panel" aria-labelledby="retirement-tab" className="space-y-6 md:space-y-8">
      {/* Retirement Metrics */}
      <motion.div variants={fadeUpItem} className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        <MetricCard title="Required Corpus" value={formatCurrency(retirementResult.requiredCorpus)} icon={Calculator} color="blue" subtitle={`In ${retirementYears} years`} />
        <MetricCard title="Monthly SIP Needed" value={formatCurrency(retirementResult.monthlySIP)} icon={Calculator} color="green" subtitle={`At ${expectedReturn}% return`} />
        <MetricCard title="Future Monthly Expense" value={formatCurrency(retirementResult.monthlyExpenseAtRetirement)} icon={Calculator} color="red" subtitle={`At ${inflation}% inflation`} />
        <MetricCard title="Lump Sum Today" value={formatCurrency(retirementResult.lumpSumToday)} icon={Calculator} color="purple" subtitle="One-time investment alternative" />
      </motion.div>

      {/* Projection Chart */}
      {retirementResult.projectionData.length > 0 && (
        <motion.div variants={fadeUpItem} className="ledger-panel p-4 sm:p-5">
          <h3 className="text-lg font-semibold mb-4">Corpus Growth Projection</h3>
          <StandardAreaChart
            data={retirementResult.projectionData}
            dataKey="year"
            height={320}
            xTickFormatter={(v) => `Yr ${v}`}
            tooltipLabelFormatter={(v) => `Year ${v}`}
            tooltipFormatter={currencyTooltipFormatter}
            ariaLabel={`Projected retirement corpus growth over ${retirementYears} years, comparing total corpus against amount contributed`}
            areas={[
              { key: 'corpus', color: rawColors.app.blue, label: 'Total Corpus' },
              {
                key: 'contributed',
                color: rawColors.app.green,
                label: 'Contributed',
                strokeDasharray: '4 4',
              },
            ]}
          />
        </motion.div>
      )}

      {/* Retirement Sliders */}
      <motion.div variants={fadeUpItem} className="ledger-panel p-4 sm:p-5">
        <h3 className="text-lg font-semibold mb-4">Adjust Assumptions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-4 sm:gap-6">
          <SliderInput id="ret-inflation" label="Inflation Rate" value={inflation} min={3} max={10} step={0.5} unit="%" valueText={`${inflation} percent`} onChange={retirement.setInflation} />
          <SliderInput id="ret-return" label="Expected Return" value={expectedReturn} min={6} max={18} step={0.5} unit="%" valueText={`${expectedReturn} percent`} onChange={retirement.setExpectedReturn} />
          <SliderInput id="ret-years" label="Years to Retirement" value={retirementYears} min={5} max={40} step={1} unit=" yrs" valueText={`${retirementYears} years`} onChange={retirement.setRetirementYears} />
        </div>
        <p className="text-xs text-text-tertiary mt-4">
          Indian defaults: 6.5% inflation (CPI avg), 12% equity return (Nifty 50 long-term CAGR)
        </p>
      </motion.div>
    </div>
  )
}
