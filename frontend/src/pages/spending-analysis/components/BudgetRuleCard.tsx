import { motion } from 'framer-motion'

import { formatCurrency, formatPercent } from '@/lib/formatters'
import { SEMANTIC_COLORS } from '@/constants/chartColors'

/** A single budget-rule card (Needs/Wants/Savings) with a target progress bar. */
export function BudgetRuleCard({ title, subtitle, icon: Icon, value, percent, target, isOverBudget, accentColor, bgClass, iconBgClass, textClass, delay }: Readonly<{
  title: string
  subtitle: string
  icon: React.ComponentType<{ className?: string }>
  value: number
  percent: number
  target: string
  isOverBudget: boolean
  accentColor: string
  bgClass: string
  iconBgClass: string
  textClass: string
  delay: number
}>) {
  const barColor = isOverBudget ? SEMANTIC_COLORS.expense : accentColor
  const statusColorClass = isOverBudget ? 'text-app-red' : 'text-app-green'

  return (
    <div className={`p-4 rounded-lg ${bgClass}`}>
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2 ${iconBgClass} rounded-lg`}>
          <Icon className={`w-5 h-5 ${textClass}`} />
        </div>
        <div>
          <p className="font-medium text-white">{title}</p>
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
        <div className="h-2 bg-surface-dropdown rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(percent, 100)}%` }}
            transition={{ duration: 0.8, ease: 'easeOut', delay }}
            style={{ backgroundColor: barColor }}
          />
        </div>
        <p className="text-xs text-text-tertiary">Target: {target} of income</p>
      </div>
    </div>
  )
}
