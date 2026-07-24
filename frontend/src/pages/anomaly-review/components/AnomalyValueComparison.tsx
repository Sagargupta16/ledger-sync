import ProgressBar from '@/components/shared/ProgressBar'
import { rawColors } from '@/constants/colors'
import type { Anomaly } from '@/hooks/api/useAnalyticsV2'
import { formatCurrency, formatPercent } from '@/lib/formatters'

interface Props {
  anomaly: Anomaly
}

export default function AnomalyValueComparison({ anomaly }: Readonly<Props>) {
  if (anomaly.expected_value == null || anomaly.actual_value == null) return null

  const scaleMax = Math.max(Math.abs(anomaly.expected_value), Math.abs(anomaly.actual_value))
  const overBaseline = (anomaly.deviation_pct ?? 0) >= 0
  const actualColor = overBaseline ? rawColors.app.red : rawColors.app.green

  return (
    <div className="mt-3 ml-0 sm:ml-11 space-y-1.5 max-w-md">
      <div className="flex items-center justify-between gap-3">
        <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2 flex-1">
          <span className="text-xs text-text-tertiary">Expected</span>
          <ProgressBar
            value={Math.abs(anomaly.expected_value)}
            max={scaleMax}
            height={6}
            color={rawColors.text.tertiary}
            ariaLabel={`Expected ${formatCurrency(anomaly.expected_value)}`}
          />
          <span className="text-xs text-foreground tabular-nums text-right">
            {formatCurrency(anomaly.expected_value)}
          </span>
        </div>
        {anomaly.deviation_pct != null && (
          <span
            className={`text-xs px-2 py-0.5 rounded-full whitespace-nowrap ${
              overBaseline ? 'bg-app-red/10 text-app-red' : 'bg-app-green/10 text-app-green'
            }`}
          >
            {anomaly.deviation_pct > 0 ? '+' : ''}
            {formatPercent(anomaly.deviation_pct / 100)}
          </span>
        )}
      </div>
      <div className="grid grid-cols-[64px_1fr_auto] items-center gap-2">
        <span className="text-xs text-text-tertiary">Actual</span>
        <ProgressBar
          value={Math.abs(anomaly.actual_value)}
          max={scaleMax}
          height={6}
          color={actualColor}
          target={Math.abs(anomaly.expected_value)}
          ariaLabel={`Actual ${formatCurrency(anomaly.actual_value)}`}
        />
        <span className="text-xs text-foreground font-medium tabular-nums text-right">
          {formatCurrency(anomaly.actual_value)}
        </span>
      </div>
    </div>
  )
}
