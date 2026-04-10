import { type LucideIcon, FileQuestion, Settings, Upload, TrendingUp, PiggyBank } from 'lucide-react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'

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
  const baseClass = `inline-flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-400 active:scale-[0.98] transition-colors duration-150 ${sizeClass}`

  if (actionHref) {
    return (
      <Link to={actionHref} className={baseClass}>
        {actionLabel}
      </Link>
    )
  }

  return (
    <button onClick={onAction} className={baseClass}>
      {actionLabel}
    </button>
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
          <div className="flex items-end gap-1 h-24 border-l border-b border-border pl-2 pb-1">
            {[40, 65, 30, 80, 55, 45, 70, 35, 60, 50].map((h) => (
              <div
                key={`empty-bar-${h}`}
                className="flex-1 rounded-t bg-white/[0.06]"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          {Icon && <Icon className="w-8 h-8 text-text-tertiary" />}
          <h3 className="text-base font-medium text-white">{title}</h3>
          {description && <p className="text-sm text-text-tertiary max-w-sm">{description}</p>}
          {actionLabel && actionHref && (
            <a href={actionHref} className="mt-2 text-sm text-blue-400 hover:text-blue-300 transition-colors duration-150">{actionLabel}</a>
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
        className={`rounded-xl bg-white/[0.06] flex items-center justify-center mb-4 ${
          getSizeClass(isCompact, 'w-12 h-12', 'w-16 h-16')
        }`}
      >
        <Icon className={`text-muted-foreground ${getSizeClass(isCompact, 'w-6 h-6', 'w-8 h-8')}`} />
      </div>

      {/* Title */}
      <h3 className={`font-medium text-white mb-1 ${getSizeClass(isCompact, 'text-sm', 'text-base')}`}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={`text-text-tertiary max-w-xs ${getSizeClass(isCompact, 'text-xs', 'text-sm')}`}>
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
      <div className="glass rounded-2xl">
        {content}
      </div>
    )
  }

  return content
}

// Export preset icons for convenience
EmptyState.icons = PRESET_ICONS
