import { motion } from 'motion/react'
import { Flame } from 'lucide-react'

import StandardBarChart from '@/components/analytics/StandardBarChart'
import MetricCard from '@/components/shared/MetricCard'
import { formatCurrency, formatCurrencyShort, formatPercent } from '@/lib/formatters'
import { rawColors } from '@/constants/colors'
import { fadeUpItem } from '@/constants/animations'

import type { FireAssumptions } from '../useFireCalculator'
import SliderInput from './SliderInput'

function savingsRateSubtitle(rate: number): string {
  if (rate >= 50) return 'FIRE-ready pace'
  if (rate >= 20) return 'Good, increase for FIRE'
  return 'Needs improvement'
}

function formatYearsToFIRE(years: number): string {
  return years === Infinity ? 'N/A' : `${years.toFixed(1)} yrs`
}

/** The deterministic FIRE tab: corpus targets, the variant ladder and its sliders. */
export default function FirePanel({ fire }: Readonly<{ fire: FireAssumptions }>) {
  const { swr, realReturn, yearsToRetire, baristaMonthlyIncome, result: fireResult } = fire
  return (
    <div role="tabpanel" id="fire-panel" aria-labelledby="fire-tab" className="space-y-6 md:space-y-8">
      {/* FIRE Metrics */}
      <motion.div variants={fadeUpItem} className="grid grid-cols-1 gap-3 min-[375px]:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-6">
        <MetricCard title="FIRE Number" value={formatCurrency(fireResult.fireNumber)} icon={Flame} color="red" subtitle={`At ${swr}% SWR`} />
        <MetricCard title="Years to FIRE" value={formatYearsToFIRE(fireResult.yearsToFIRE)} icon={Flame} color="orange" subtitle={`At ${realReturn}% real return`} />
        <MetricCard title="Coast FIRE" value={formatCurrency(fireResult.coastFIRE)} icon={Flame} color="teal" subtitle="Amount needed today" />
        <MetricCard title="Savings Rate" value={formatPercent(fireResult.currentSavingsRate)} icon={Flame} color="green" subtitle={savingsRateSubtitle(fireResult.currentSavingsRate)} />
      </motion.div>

      {/* FIRE Variants -- one shared INR axis so the tiers are directly
          comparable (Fat = 2x Standard, Lean < Standard) at a glance,
          instead of four isolated number tiles. */}
      <motion.div variants={fadeUpItem} className="ledger-panel p-4 sm:p-5">
        <h3 className="text-lg font-semibold mb-4">FIRE Variants</h3>
        <div className="-mx-4 sm:mx-0">
          <StandardBarChart
            data={[
              { tier: 'Lean', corpus: fireResult.leanFIRE, color: rawColors.app.green },
              { tier: 'Barista', corpus: fireResult.baristaFIRE, color: rawColors.app.teal },
              { tier: 'Standard', corpus: fireResult.fireNumber, color: rawColors.app.blue },
              { tier: 'Fat', corpus: fireResult.fatFIRE, color: rawColors.app.purple },
            ]}
            layout="vertical"
            yCategoryKey="tier"
            dataKey="tier"
            yWidth={72}
            height={200}
            bars={[
              {
                key: 'corpus',
                color: rawColors.app.blue,
                getCellColor: (row) => (row as { color: string }).color,
              },
            ]}
            showLegend={false}
            tooltipFormatter={(v) => formatCurrency(v)}
            xTickFormatter={(v) => formatCurrencyShort(v as number)}
            ariaLabel="Horizontal bar chart comparing the corpus needed for Lean, Barista, Standard and Fat FIRE"
          />
        </div>
        <div className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-text-tertiary min-[375px]:grid-cols-2 lg:grid-cols-4">
          <p><span className="text-app-green font-medium">Lean</span> · essentials only (60%)</p>
          <p>
            <span className="text-app-teal font-medium">Barista</span> ·{' '}
            {baristaMonthlyIncome > 0
              ? `${formatCurrencyShort(baristaMonthlyIncome)}/mo part-time`
              : 'set part-time income below'}
          </p>
          <p><span className="text-app-blue font-medium">Standard</span> · current lifestyle</p>
          <p><span className="text-app-purple font-medium">Fat</span> · 2x with buffer</p>
        </div>
      </motion.div>

      {/* FIRE Sliders */}
      <motion.div variants={fadeUpItem} className="ledger-panel p-4 sm:p-5">
        <h3 className="text-lg font-semibold mb-4">Adjust Assumptions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-4 sm:gap-6">
          <SliderInput id="fire-swr" label="Safe Withdrawal Rate" value={swr} min={2} max={5} step={0.5} unit="%" valueText={`${swr} percent`} onChange={fire.setSwr} />
          <SliderInput id="fire-return" label="Real Return (post-inflation)" value={realReturn} min={2} max={12} step={0.5} unit="%" valueText={`${realReturn} percent`} onChange={fire.setRealReturn} />
          <SliderInput id="fire-years" label="Years to FIRE" value={yearsToRetire} min={5} max={40} step={1} unit=" yrs" valueText={`${yearsToRetire} years`} onChange={fire.setYearsToRetire} />
          <SliderInput
            id="fire-barista"
            label="Barista / Part-time income"
            value={baristaMonthlyIncome}
            min={0}
            max={200_000}
            step={5_000}
            unit="/mo"
            valueText={`${formatCurrency(baristaMonthlyIncome)} per month`}
            onChange={fire.setBaristaMonthlyIncome}
          />
        </div>
        <p className="text-xs text-text-tertiary mt-4">
          India defaults: 3% SWR (higher inflation vs 4% US rule), 6% real return (12% nominal - 6% inflation).
          Set a non-zero barista income to see how much smaller your corpus needs to be with part-time work.
        </p>
      </motion.div>
    </div>
  )
}
