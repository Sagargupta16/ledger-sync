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
  const baseClass = `inline-flex items-center gap-2 px-5 py-2.5 bg-ios-blue-vibrant text-white rounded-xl font-medium hover:bg-ios-blue active:scale-[0.98] transition-all shadow-lg shadow-ios-blue-vibrant/30 ${sizeClass}`

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
          <div className="flex items-end gap-1 h-24 border-l border-b border-white/10 pl-2 pb-1">
            {[40, 65, 30, 80, 55, 45, 70, 35, 60, 50].map((h) => (
              <div
                key={`empty-bar-${h}`}
                className="flex-1 rounded-t bg-white/5"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-center gap-2">
          {Icon && <Icon className="w-8 h-8 text-gray-600" />}
          <h3 className="text-base font-semibold text-gray-300">{title}</h3>
          {description && <p className="text-sm text-gray-500 max-w-sm">{description}</p>}
          {actionLabel && actionHref && (
            <a href={actionHref} className="mt-2 text-sm text-primary hover:underline">{actionLabel}</a>
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
      {/* Icon - iOS style */}
      <div
        className={`rounded-2xl bg-ios-blue-vibrant/15 flex items-center justify-center mb-4 ${
          getSizeClass(isCompact, 'w-12 h-12', 'w-16 h-16')
        }`}
        style={{ boxShadow: '0 8px 32px rgba(10, 132, 255, 0.15)' }}
      >
        <Icon className={`text-ios-blue-vibrant ${getSizeClass(isCompact, 'w-6 h-6', 'w-8 h-8')}`} />
      </div>

      {/* Title */}
      <h3 className={`font-semibold text-white mb-1 ${getSizeClass(isCompact, 'text-sm', 'text-lg')}`}>
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p className={`text-muted-foreground max-w-xs ${getSizeClass(isCompact, 'text-xs', 'text-sm')}`}>
          {description}
        </p>
      )}

      {/* Action Button - iOS style */}
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
      <div className="glass rounded-2xl border border-white/[0.08] shadow-lg shadow-black/20">
        {content}
      </div>
    )
  }

  return content
}

// Export preset icons for convenience
EmptyState.icons = PRESET_ICONS
