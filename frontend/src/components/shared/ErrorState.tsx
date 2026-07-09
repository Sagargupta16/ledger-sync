import { AlertCircle, RefreshCw, WifiOff, ServerCrash } from 'lucide-react'
import { motion } from 'framer-motion'

interface ErrorStateProps {
  readonly title?: string
  readonly message?: string
  readonly onRetry?: () => void
  readonly variant?: 'default' | 'compact' | 'card' | 'inline'
  readonly errorType?: 'network' | 'server' | 'generic'
}

const ERROR_ICONS = {
  network: WifiOff,
  server: ServerCrash,
  generic: AlertCircle,
}

const ERROR_TITLES = {
  network: 'Connection Error',
  server: 'Server Error',
  generic: 'Something went wrong',
}

const ERROR_MESSAGES = {
  network: 'Please check your internet connection and try again.',
  server: 'Our servers are having issues. Please try again later.',
  generic: 'An unexpected error occurred. Please try again.',
}

export default function ErrorState({
  title,
  message,
  onRetry,
  variant = 'default',
  errorType = 'generic',
}: ErrorStateProps) {
  const Icon = ERROR_ICONS[errorType]
  const displayTitle = title || ERROR_TITLES[errorType]
  const displayMessage = message || ERROR_MESSAGES[errorType]

  const isCompact = variant === 'compact'
  const isInline = variant === 'inline'
  const isCard = variant === 'card'

  // Inline variant - minimal horizontal layout
  if (isInline) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center gap-3 rounded-lg border border-error/20 bg-error/10 px-4 py-3 shadow-[var(--ledger-control-shadow)]"
      >
        <AlertCircle className="w-5 h-5 text-error shrink-0" />
        <p className="text-sm text-error flex-1">{displayMessage}</p>
        {onRetry && (
          <button
            onClick={onRetry}
            className="shrink-0 rounded-md px-2 py-1 text-sm font-medium text-error transition-colors duration-150 hover:bg-error/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40"
            aria-label="Retry"
          >
            Retry
          </button>
        )}
      </motion.div>
    )
  }

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex flex-col items-center justify-center text-center ${
        isCompact ? 'py-6 px-4' : 'py-10 px-6'
      }`}
    >
      {/* Icon */}
      <div
        className={`mb-4 flex items-center justify-center rounded-xl border border-error/20 bg-error/10 ${
          isCompact ? 'w-12 h-12' : 'w-16 h-16'
        }`}
      >
        <Icon className={`text-error ${isCompact ? 'w-6 h-6' : 'w-8 h-8'}`} />
      </div>

      {/* Title */}
      <h3
        className={`mb-1 font-semibold text-foreground ${
          isCompact ? 'text-sm' : 'text-base'
        }`}
      >
        {displayTitle}
      </h3>

      {/* Message */}
      <p
        className={`max-w-xs text-text-tertiary ${
          isCompact ? 'text-xs' : 'text-sm'
        }`}
      >
        {displayMessage}
      </p>

      {/* Retry Button */}
      {onRetry && (
        <button
          onClick={onRetry}
          className={`mt-4 inline-flex items-center gap-2 rounded-lg border border-error/20 bg-error/10 px-4 py-2 font-medium text-error transition-colors duration-150 hover:bg-error/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-error/40 ${
            isCompact ? 'text-xs' : 'text-sm'
          }`}
          aria-label="Retry loading"
        >
          <RefreshCw className={isCompact ? 'w-3 h-3' : 'w-4 h-4'} />
          Try Again
        </button>
      )}
    </motion.div>
  )

  if (isCard) {
    return (
      <div className="glass rounded-2xl border border-error/20 shadow-[var(--glass-shadow)]">
        {content}
      </div>
    )
  }

  return content
}
