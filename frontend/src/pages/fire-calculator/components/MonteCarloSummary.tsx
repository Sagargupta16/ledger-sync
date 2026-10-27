import { motion } from 'motion/react'
import { Flag, Hourglass, Landmark, ShieldCheck } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import type { MetricColor } from '@/constants/colors'
import { fadeUpItem } from '@/constants/animations'
import type { MonteCarloInputs, MonteCarloResult } from '@/lib/finance/monteCarlo'
import { formatCurrencyShort, formatPercent, getActiveLocale } from '@/lib/formatters'

import { formatRunShare, samplingMarginPoints } from '../monteCarloFormat'

interface MonteCarloSummaryProps {
  readonly result: MonteCarloResult
  /** The inputs this result came from, so labels never describe newer, unrun edits. */
  readonly inputs: MonteCarloInputs
}

/** Common planning bands for a success rate; a guide, not a rule. */
function successColor(rate: number): MetricColor {
  if (rate >= 0.85) return 'green'
  if (rate >= 0.7) return 'yellow'
  return 'red'
}

/** What the success rate means, and how much a new seed alone could move it. */
function successInfo(result: MonteCarloResult, locale: string): string {
  const meaning = 'Share of simulated lifetimes in which the portfolio pays every year of spending up to the end age.'
  const margin = samplingMarginPoints(result.successRate, result.runs)
  if (margin === null) return meaning
  return `${meaning} At ${result.runs.toLocaleString(locale)} runs, sampling alone moves it by about ±${margin.toFixed(1)} points, so a new seed can shift it that much.`
}

/** Success rate, the median balances at retirement and at the end, and when failing runs ran out. */
export default function MonteCarloSummary({ result, inputs }: MonteCarloSummaryProps) {
  const locale = getActiveLocale()
  const lasting = Math.round(result.successRate * result.runs)
  const fall = formatPercent(inputs.equityDrawdown * 100, false, 0)
  const stressNote = result.successWithoutDrawdown === null
    ? `${lasting.toLocaleString(locale)} of ${result.runs.toLocaleString(locale)} runs last to ${inputs.endAge}`
    : `With a ${fall} equity fall at retirement; ${formatRunShare(result.successWithoutDrawdown)} without it`
  const failure = result.failureAge
  return (
    <motion.div variants={fadeUpItem} className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4 lg:gap-6">
      <MetricCard
        title="Success rate"
        value={formatRunShare(result.successRate)}
        icon={ShieldCheck}
        color={successColor(result.successRate)}
        subtitle={stressNote}
        titleInfo={successInfo(result, locale)}
      />
      <MetricCard
        title={`Median at ${inputs.retireAge}`}
        value={formatCurrencyShort(result.medianAtRetirement)}
        icon={Flag}
        color="purple"
        subtitle={inputs.equityDrawdown > 0
          ? `As you retire, after the ${fall} equity fall, in today's money`
          : "Portfolio on the day you retire, in today's money"}
      />
      <MetricCard
        title={`Median at ${inputs.endAge}`}
        value={formatCurrencyShort(result.medianEnding)}
        icon={Landmark}
        color="blue"
        subtitle="Left at the end age; runs that ran out count as zero"
      />
      <MetricCard
        title="Failure age"
        value={failure ? `${failure.median}` : 'None'}
        icon={Hourglass}
        color="orange"
        subtitle={failure
          ? `Median age when runs ran out; the earliest tenth by ${failure.earlyTenth}`
          : `No run ran out before ${inputs.endAge}`}
      />
    </motion.div>
  )
}
