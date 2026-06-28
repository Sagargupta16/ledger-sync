import { formatCurrency, formatPercent } from '@/lib/formatters'
import { SEMANTIC_COLORS } from '@/constants/chartColors'
import { ProgressBar } from '@/components/shared'

/** A single budget-rule card (Needs/Wants/Savings) with a target progress bar. */
export function BudgetRuleCard({ title, subtitle, icon: Icon, value, percent, target, targetPercent, isOverBudget, accentColor, bgClass, iconBgClass, textClass }: Readonly<{
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  value: number
  percent: number
  target: string
  /** Numeric goal (% of income) -- drives the target tick on the bar. */
  targetPercent: number
  isOverBudget: boolean
  accentColor: string
  bgClass: string
  iconBgClass: string
  textClass: string
}>) {
  const barColor = isOverBudget ? SEMANTIC_COLORS.expense : accentColor
  const statusColorClass = isOverBudget ? 'text-app-red' : 'text-app-green'
  const deltaPts = percent - targetPercent

  return (
    <div className={`p-4 rounded-lg ${bgClass}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 ${iconBgClass} rounded-lg`}>
          <Icon className={`w-5 h-5 ${textClass}`} />
        </div>
        <div>
          <p className="font-medium text-foreground">{title}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <p className={`text-2xl font-bold ${textClass} mb-2`}>
        {formatCurrency(value)}
      </p>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Current</span>
          <span className={statusColorClass}>
            {formatPercent(percent)}
          </span>
        </div>
        {/* Bar shows the actual share against a tick at the target -- so each
            card answers "are you above or below goal?" on its own (the donut no
            longer carries the target ring). */}
        <ProgressBar
          value={percent}
          max={100}
          target={targetPercent}
          color={barColor}
          height={8}
          ariaLabel={`${title} is ${percent.toFixed(0)} percent of income against a ${targetPercent} percent target`}
        />
        <p className="text-xs text-text-tertiary">
          Target: {target} of income
          {Number.isFinite(deltaPts) && Math.abs(deltaPts) >= 0.5 && (
            <span className={statusColorClass}>
              {' '}&middot; {deltaPts > 0 ? '+' : ''}{deltaPts.toFixed(0)} pts vs target
            </span>
          )}
        </p>
      </div>
    </div>
  )
}
