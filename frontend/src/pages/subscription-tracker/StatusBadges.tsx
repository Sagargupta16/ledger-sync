import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, UserPlus } from 'lucide-react'
import { getConfidenceColor } from './helpers'

// ---------------------------------------------------------------------------
// ConfidenceIndicator
// ---------------------------------------------------------------------------

export function ConfidenceIndicator({ confidence }: Readonly<{ confidence: number }>) {
  const percent = Math.round(confidence * 100)
  const color = getConfidenceColor(percent)

  return (
    <div className="flex items-center gap-2">
      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
          style={{ backgroundColor: color }}
        />
      </div>
      <span className="text-xs text-muted-foreground">{percent}%</span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// StatusBadge
// ---------------------------------------------------------------------------

export function StatusBadge({ status }: Readonly<{ status: 'active' | 'possibly_inactive' }>) {
  if (status === 'active') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ios-green/15 text-ios-green">
        <CheckCircle2 className="w-3 h-3" />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
      <AlertTriangle className="w-3 h-3" />
      Possibly Inactive
    </span>
  )
}

// ---------------------------------------------------------------------------
// ConfirmBadge
// ---------------------------------------------------------------------------

export function ConfirmBadge({
  isConfirmed,
  onToggle,
}: Readonly<{
  isConfirmed: boolean
  onToggle: () => void
}>) {
  if (isConfirmed) {
    return (
      <button
        onClick={onToggle}
        title="Confirmed as active subscription. Click to unconfirm."
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ios-green/15 text-ios-green hover:bg-ios-green/25 transition-colors"
      >
        <CheckCircle2 className="w-3 h-3" />
        Confirmed
      </button>
    )
  }
  return (
    <button
      onClick={onToggle}
      title="Click to confirm as active subscription"
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white transition-colors"
    >
      <CheckCircle2 className="w-3 h-3" />
      Detected
    </button>
  )
}

// ---------------------------------------------------------------------------
// ManualBadge
// ---------------------------------------------------------------------------

export function ManualBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-ios-purple/15 text-ios-purple">
      <UserPlus className="w-3 h-3" />
      Manual
    </span>
  )
}
