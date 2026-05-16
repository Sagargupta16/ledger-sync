import { Minus, TrendingDown, TrendingUp } from 'lucide-react'

import { rawColors } from '@/constants/colors'

// eslint-disable-next-line react-refresh/only-export-components
export function getChangeIcon(changePercent: number, isExpense = false) {
  if (Math.abs(changePercent) < 1)
    return <Minus className="w-4 h-4 text-muted-foreground" />
  if (isExpense) {
    return changePercent > 0 ? (
      <TrendingUp className="w-4 h-4" style={{ color: rawColors.app.red }} />
    ) : (
      <TrendingDown className="w-4 h-4" style={{ color: rawColors.app.green }} />
    )
  }
  return changePercent > 0 ? (
    <TrendingUp className="w-4 h-4" style={{ color: rawColors.app.green }} />
  ) : (
    <TrendingDown className="w-4 h-4" style={{ color: rawColors.app.red }} />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function getChangeColor(changePercent: number, isExpense = false) {
  if (Math.abs(changePercent) < 1) return rawColors.text.secondary
  if (isExpense) {
    return changePercent > 0 ? rawColors.app.red : rawColors.app.green
  }
  return changePercent > 0 ? rawColors.app.green : rawColors.app.red
}

export function ChangeDisplay({
  changePercent,
  isExpense,
}: Readonly<{ changePercent: number; isExpense?: boolean }>) {
  const prefix = changePercent > 0 ? '+' : ''
  return (
    <div className="flex items-center justify-end gap-2">
      {getChangeIcon(changePercent, isExpense)}
      <span
        className="font-semibold"
        style={{ color: getChangeColor(changePercent, isExpense) }}
      >
        {prefix}
        {changePercent.toFixed(1)}%
      </span>
    </div>
  )
}

interface SummaryCardProps {
  label: string
  color: string
  changePercent: number
  isExpense?: boolean
  showRate?: boolean
  rateValue?: number
}

export function SummaryCard({
  label,
  color,
  changePercent,
  isExpense,
  showRate,
  rateValue,
}: Readonly<SummaryCardProps>) {
  return (
    <div
      className="p-4 rounded-2xl"
      style={{
        backgroundColor: `${color}14`,
        borderWidth: 1,
        borderColor: `${color}26`,
      }}
    >
      <p className="text-xs mb-1" style={{ color: rawColors.text.secondary }}>
        {label}
      </p>
      {showRate ? (
        <span className="text-lg font-semibold" style={{ color }}>
          {rateValue?.toFixed(1)}%
        </span>
      ) : (
        <div className="flex items-center gap-1">
          {getChangeIcon(changePercent, isExpense)}
          <span
            className="text-lg font-semibold"
            style={{ color: getChangeColor(changePercent, isExpense) }}
          >
            {changePercent > 0 ? '+' : ''}
            {changePercent.toFixed(1)}%
          </span>
        </div>
      )}
    </div>
  )
}
