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
  readonly variant?: 'default' | 'compact' | 'card'
}

const PRESET_ICONS: Record<string, LucideIcon> = {
  upload: Upload,
  settings: Settings,
  trending: TrendingUp,
  savings: PiggyBank,
  default: FileQuestion,
}

export default function EmptyState({
  icon: Icon = FileQuestion,
  title,
  description,
  actionLabel,
  actionHref,
  onAction,
  variant = 'default',
}: EmptyStateProps) {
  const isCompact = variant === 'compact'
  const isCard = variant === 'card'

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${
        isCompact ? 'py-6 px-4' : isCard ? 'py-8 px-6' : 'py-12 px-6'
      }`}
    >
      {/* Icon - iOS style */}
      <div
        className={`rounded-2xl bg-ios-blue-vibrant/15 flex items-center justify-center mb-4 ${
          isCompact ? 'w-12 h-12' : 'w-16 h-16'
        }`}
        style={{ boxShadow: '0 8px 32px rgba(10, 132, 255, 0.15)' }}
      >
        <Icon className={`text-ios-blue-vibrant ${isCompact ? 'w-6 h-6' : 'w-8 h-8'}`} />
      </div>

      {/* Title */}
      <h3
        className={`font-semibold text-white mb-1 ${
          isCompact ? 'text-sm' : 'text-lg'
        }`}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p
          className={`text-muted-foreground max-w-xs ${
            isCompact ? 'text-xs' : 'text-sm'
          }`}
        >
          {description}
        </p>
      )}

      {/* Action Button - iOS style */}
      {(actionLabel && (actionHref || onAction)) && (
        <div className={isCompact ? 'mt-3' : 'mt-5'}>
          {actionHref ? (
            <Link
              to={actionHref}
              className={`inline-flex items-center gap-2 px-5 py-2.5 bg-ios-blue-vibrant text-white rounded-xl font-medium hover:bg-ios-blue active:scale-[0.98] transition-all shadow-lg shadow-ios-blue-vibrant/30 ${
                isCompact ? 'text-xs' : 'text-sm'
              }`}
            >
              {actionLabel}
            </Link>
          ) : (
            <button
              onClick={onAction}
              className={`inline-flex items-center gap-2 px-5 py-2.5 bg-ios-blue-vibrant text-white rounded-xl font-medium hover:bg-ios-blue active:scale-[0.98] transition-all shadow-lg shadow-ios-blue-vibrant/30 ${
                isCompact ? 'text-xs' : 'text-sm'
              }`}
            >
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </motion.div>
  )

  if (isCard) {
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
