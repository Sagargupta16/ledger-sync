import { Crown, Receipt, Repeat, Store, Target } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import { formatCurrency, formatPercent } from '@/lib/formatters'

import { toLabelKind } from '../merchantUtils'
import type { MerchantRow, MerchantStats } from '../types'

interface MerchantKpiGridProps {
  readonly stats: MerchantStats
  readonly isLoading: boolean
  readonly threshold: number
}

/** "Uber" vs "Home (note)" -- never present a note as a confirmed payee. */
function labelWithKind(row: MerchantRow | null): string {
  if (!row) return 'None yet'
  const kind = toLabelKind(row.label_kind)
  if (kind === 'descriptor') return `${row.merchant} (note)`
  return row.merchant
}

/**
 * KPI strip for merchant intelligence.
 *
 * Every card carries a comparator, not a bare number: the count is qualified by
 * how many payments it covers, the top merchant by its share of tracked spend,
 * the average ticket by the median so a single outlier payer is visible, and
 * concentration by how many merchants the threshold actually took.
 */
export default function MerchantKpiGrid({
  stats,
  isLoading,
  threshold,
}: MerchantKpiGridProps) {
  const {
    merchantCount,
    trackedPayments,
    trackedSpend,
    topBySpend,
    topByFrequency,
    avgTicket,
    medianMerchantTicket,
    topShare,
    vitalFewCount,
    vitalFewShare,
  } = stats

  const concentration =
    merchantCount > 0 ? `${vitalFewCount} of ${merchantCount}` : 'No data'

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-5 lg:gap-6">
      <MetricCard
        title="Payees Tracked"
        value={merchantCount}
        icon={Store}
        color="blue"
        isLoading={isLoading}
        subtitle={
          merchantCount > 0
            ? `${trackedPayments} payments, ${formatCurrency(trackedSpend)}`
            : 'Notes are what identify a payee'
        }
      />
      {/* Payee NAMES go in the subtitle, never the value slot: MetricCard runs
          its value through a count-up that parses embedded digits, so a free-text
          label like "Rent - Flat (1B Hyd)" would render "Rent - Flat (0B Hyd)"
          mid-animation -- a payee that never existed. The value slot gets the
          figure the count-up is meant for. */}
      <MetricCard
        title="Biggest Payee"
        value={topBySpend ? formatCurrency(topBySpend.total_spent) : 'None yet'}
        icon={Crown}
        color="orange"
        isLoading={isLoading}
        subtitle={
          topBySpend
            ? `${labelWithKind(topBySpend)}, ${formatPercent(topShare)} of tracked spend`
            : 'Notes are what identify a payee'
        }
        titleInfo="Largest total spend across all payments that share this label."
      />
      <MetricCard
        title="Most Frequent"
        value={
          topByFrequency ? `${topByFrequency.transaction_count} payments` : 'None yet'
        }
        icon={Repeat}
        color="teal"
        isLoading={isLoading}
        subtitle={
          topByFrequency
            ? `${labelWithKind(topByFrequency)}, avg ${formatCurrency(topByFrequency.avg_transaction)}`
            : 'Notes are what identify a payee'
        }
        titleInfo="Most payments, which is not always the most expensive payee."
      />
      <MetricCard
        title="Avg Payment"
        value={formatCurrency(avgTicket)}
        icon={Receipt}
        color="purple"
        isLoading={isLoading}
        subtitle={`Median payee avg ${formatCurrency(medianMerchantTicket)}`}
        titleInfo="Tracked spend divided by tracked payments. The median beside it shows how skewed the mix is."
      />
      <MetricCard
        title="Concentration"
        value={concentration}
        icon={Target}
        color="red"
        isLoading={isLoading}
        subtitle={
          merchantCount > 0
            ? `payees reach ${formatPercent(vitalFewShare)} of spend (target ${threshold}%)`
            : undefined
        }
        titleInfo={`How few payees it takes to cover ${threshold}% of tracked spend. Fewer means more concentrated.`}
      />
    </div>
  )
}
