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
    <div className={`min-w-0 py-5 first:pt-0 last:pb-0 ${bgClass}`}>
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`shrink-0 p-2 ${iconBgClass} rounded-md`}>
            <Icon className={`size-4 ${textClass}`} />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{title}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        <p className={`shrink-0 font-mono text-xl font-semibold tabular-nums ${value < 0 ? 'text-app-red' : textClass}`}>
          {formatCurrency(value)}
        </p>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Current</span>
          <span className={`font-mono font-medium tabular-nums ${statusColorClass}`}>
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
          height={10}
          ariaLabel={`${title} is ${percent.toFixed(0)} percent of income against a ${targetPercent} percent target`}
        />
        <p className="text-xs leading-relaxed text-muted-foreground">
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
