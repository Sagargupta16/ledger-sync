import { CalendarDays } from 'lucide-react'

import { Money } from '@/components/ui'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'
import { formatMonthKey } from '@/lib/dateKeys'

interface Props {
  anomaly: Anomaly
}

const AMOUNT_LABELS: Partial<Record<Anomaly['anomaly_type'], string>> = {
  duplicate_suspected: 'Possible extra charge',
  fee_charge: 'Charged',
}

/**
 * The month a finding belongs to, and its amount when there is no baseline to
 * draw a comparison against (a possible duplicate, a fee, a closed-account row).
 */
export default function AnomalyFacts({ anomaly }: Readonly<Props>) {
  const amountOnly = anomaly.expected_value == null && anomaly.actual_value != null
  if (!anomaly.period_key && !amountOnly) return null
  const amountLabel = AMOUNT_LABELS[anomaly.anomaly_type] ?? 'Amount'

  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-text-tertiary sm:ml-11">
      {anomaly.period_key && (
        <span className="inline-flex items-center gap-1.5">
          <CalendarDays className="h-3.5 w-3.5" aria-hidden />
          {formatMonthKey(anomaly.period_key)}
        </span>
      )}
      {amountOnly && anomaly.actual_value != null && (
        <span className="inline-flex items-center gap-1.5">
          {amountLabel}
          <Money value={anomaly.actual_value} className="text-foreground" />
        </span>
      )}
    </div>
  )
}
