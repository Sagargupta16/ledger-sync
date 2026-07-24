import { Link } from 'react-router-dom'

import { type LucideIcon, FileQuestion, Settings, Upload, TrendingUp, PiggyBank } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui'

interface EmptyStateProps {
  readonly icon?: LucideIcon
  readonly title: string
  readonly description?: string
  readonly actionLabel?: string
  readonly actionHref?: string
  readonly onAction?: () => void
  readonly variant?: 'default' | 'compact' | 'card' | 'chart'
  readonly className?: string
}

const PRESET_ICONS: Record<string, LucideIcon> = {
  upload: Upload,
  settings: Settings,
  trending: TrendingUp,
  savings: PiggyBank,
  default: FileQuestion,
}

type Variant = 'default' | 'compact' | 'card' | 'chart'

const paddingClasses: Record<Variant, string> = {
  compact: 'py-6 px-4',
  card: 'py-8 px-6',
  chart: 'py-8 px-6',
  default: 'py-12 px-6',
}

function getSizeClass(isCompact: boolean, compact: string, normal: string): string {
  return isCompact ? compact : normal
}

function ActionButton({ actionLabel, actionHref, onAction, isCompact }: Readonly<{
  actionLabel: string
  actionHref?: string
  onAction?: () => void
  isCompact: boolean
}>) {
  const sizeClass = getSizeClass(isCompact, 'text-xs', 'text-sm')
  const baseClass = `inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-lg border border-app-blue/40 bg-app-blue px-4 py-2 font-medium text-primary-foreground shadow-[var(--ledger-control-shadow)] transition-colors duration-150 hover:border-app-blue/60 hover:bg-app-blue-vibrant active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] sm:min-h-0 sm:min-w-0 ${sizeClass}`

  if (actionHref) {
    return (
      <Link to={actionHref} className={baseClass}>
        {actionLabel}
      </Link>
    )
  }

  return (
    <Button type="button" onClick={onAction} className={baseClass}>
      {actionLabel}
    </Button>
  )
}

export default function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  variant = 'default',
  className = '',
}: EmptyStateProps) {
  const isCompact = variant === 'compact'
  const hasAction = actionLabel && (actionHref || onAction)

  if (variant === 'chart') {
    return (
      <div className={`py-8 px-6 text-center ${className}`}>
        {/* Faux chart skeleton */}
        <div className="mx-auto max-w-sm mb-4">
          <div
            role="img"
            aria-label="Empty chart placeholder"
            className="flex h-24 items-end gap-1 border-b border-l border-[var(--hairline-2)] pb-1 pl-2"
          >
            {[40, 65, 30, 80, 55, 45, 70, 35, 60, 50].map((h) => (
              <div
                key={`empty-bar-${h}`}
                className="flex-1 rounded-t bg-[var(--overlay-3)]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          {Icon && <Icon className="w-8 h-8 text-text-tertiary" />}
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && <p className="text-sm text-text-tertiary max-w-sm">{description}</p>}
          {actionLabel && actionHref && (
            <div className="mt-2">
              <ActionButton
                actionLabel={actionLabel}
                actionHref={actionHref}
                isCompact={false}
              />
            </div>
          )}
        </div>
      </div>
    )
  }

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${paddingClasses[variant]}`}
    >
      {/* Icon */}
      <div
        className={`mb-4 flex items-center justify-center rounded-xl border border-[var(--hairline-2)] bg-[var(--overlay-3)] ${
          getSizeClass(isCompact, 'w-12 h-12', 'w-16 h-16')
        }`}
      >
        <Icon className={`text-muted-foreground ${getSizeClass(isCompact, 'w-6 h-6', 'w-8 h-8')}`} />
      </div>

      {/* Title */}
      <h3 className={`mb-1 font-semibold text-foreground ${getSizeClass(isCompact, 'text-sm', 'text-base')}`}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={`max-w-xs text-text-tertiary ${getSizeClass(isCompact, 'text-xs', 'text-sm')}`}>
          {description}
        </p>
      )}

      {/* Action Button */}
      {hasAction && (
        <div className={isCompact ? 'mt-3' : 'mt-5'}>
          <ActionButton
            actionLabel={actionLabel}
            actionHref={actionHref}
            onAction={onAction}
            isCompact={isCompact}
          />
        </div>
      )}
    </motion.div>
  )

  if (variant === 'card') {
    return (
      <div className="glass rounded-2xl border border-[var(--glass-border)]">
        {content}
      </div>
    )
  }

  return content
}

// Export preset icons for convenience
EmptyState.icons = PRESET_ICONS
