import { motion } from 'framer-motion'
import { AlertTriangle, CheckCircle, Edit2, Trash2 } from 'lucide-react'

import Sparkline from '@/components/shared/Sparkline'
import { rawColors } from '@/constants/colors'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import type { CategoryMomentum } from '@/lib/momentumCalculator'

import { STATUS_CONFIG } from '../budgetUtils'
import type { BudgetPeriod, BudgetRow } from '../types'

interface BudgetRowItemProps {
  row: BudgetRow
  isEditing: boolean
  alertThreshold: number
  isFixed: boolean
  momentum: CategoryMomentum | undefined
  onEdit: () => void
  onCancelEdit: () => void
  onSave: (limit: number, period: BudgetPeriod) => void
  onDelete: () => void
}

const MOMENTUM_COLOR = {
  accelerating: rawColors.app.red,
  decelerating: rawColors.app.green,
  stable: rawColors.app.yellow,
}

const MOMENTUM_CLASS = {
  accelerating: 'text-app-red',
  decelerating: 'text-app-green',
  stable: 'text-app-yellow',
}

export function BudgetRowItem(props: Readonly<BudgetRowItemProps>) {
  const { row, isEditing, alertThreshold, isFixed, momentum, onEdit, onCancelEdit, onSave, onDelete } =
    props
  const cfg = STATUS_CONFIG[row.status]
  const key = row.subcategory ? `${row.category}::${row.subcategory}` : row.category

  return (
    <motion.div
      key={key}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`glass rounded-2xl border p-6 hover:bg-white/[0.04] transition-colors ${cfg.border} ${cfg.bg}`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {row.status === 'exceeded' ? (
            <AlertTriangle className={`w-4 h-4 ${cfg.text}`} />
          ) : (
            <CheckCircle className={`w-4 h-4 ${cfg.text}`} />
          )}
          <div>
            <span className="font-medium">{row.category}</span>
            {row.subcategory && (
              <span className="text-muted-foreground text-sm ml-1">/ {row.subcategory}</span>
            )}
          </div>
          <span className="text-xs text-text-tertiary ml-2 px-2 py-0.5 rounded-full bg-white/5">
            {row.period}
          </span>
          {isFixed && (
            <span className="text-xs ml-1 px-2 py-0.5 rounded-full bg-app-purple/15 text-app-purple border border-app-purple/20">
              Fixed
            </span>
          )}
          {momentum && momentum.sparklineData.length >= 3 && (
            <div className="ml-2 flex items-center gap-1">
              <Sparkline
                data={momentum.sparklineData}
                color={MOMENTUM_COLOR[momentum.classification]}
                height={20}
                showTooltip={false}
              />
              <span className={`text-caption ${MOMENTUM_CLASS[momentum.classification]}`}>
                {momentum.slope > 0 ? '+' : ''}
                {momentum.slope}%
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isEditing ? (
            <input
              type="number"
              inputMode="decimal"
              defaultValue={row.limit}
              onBlur={(e) => {
                onSave(Number.parseFloat(e.target.value), row.period)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSave(Number.parseFloat((e.target as HTMLInputElement).value), row.period)
                }
                if (e.key === 'Escape') onCancelEdit()
              }}
              className="w-28 px-2 py-1 rounded-lg bg-[rgba(44,44,46,0.6)] backdrop-blur-xl border border-border text-sm text-white"
              autoFocus
            />
          ) : (
            <>
              <span className={`text-lg font-bold ${cfg.text}`}>
                {formatPercent(row.percentage)}
              </span>
              <button
                onClick={onEdit}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
              >
                <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
              <button
                onClick={() => {
                  if (globalThis.confirm('Delete this budget? This cannot be undone.')) onDelete()
                }}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors text-app-red"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      <div className="relative h-5 mb-2">
        <div className="absolute inset-0 flex rounded-full overflow-hidden">
          <div
            className="h-full bg-white/5"
            style={{ width: `${Math.min(alertThreshold * 0.75, 100)}%` }}
          />
          <div
            className="h-full bg-white/10"
            style={{
              width: `${Math.min(alertThreshold - alertThreshold * 0.75, 100 - alertThreshold * 0.75)}%`,
            }}
          />
          <div
            className="h-full bg-white/10"
            style={{ width: `${Math.max(100 - alertThreshold, 0)}%` }}
          />
        </div>
        <motion.div
          className="absolute top-1 left-0 h-3 rounded-full"
          style={{ backgroundColor: cfg.color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, row.percentage)}%` }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-white/20"
          style={{ left: `${Math.min(100, row.percentage)}%`, transform: 'translateX(-1px)' }}
        />
        <div
          className="absolute top-0 h-full w-0.5 bg-app-yellow/60"
          style={{ left: `${alertThreshold}%`, transform: 'translateX(-1px)' }}
        />
      </div>

      <div className="mb-1">
        {row.remaining >= 0 ? (
          <p className="text-sm font-semibold text-app-green">
            {formatCurrency(row.remaining)} left to spend
          </p>
        ) : (
          <p className="text-sm font-semibold text-app-red">
            {formatCurrency(Math.abs(row.remaining))} over budget
          </p>
        )}
      </div>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatCurrency(row.spent)} spent</span>
        <span>of {formatCurrency(row.limit)}</span>
      </div>
    </motion.div>
  )
}
