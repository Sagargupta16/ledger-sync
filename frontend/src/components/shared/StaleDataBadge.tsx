import { Info } from 'lucide-react'

interface StaleDataBadgeProps {
  /** Whether the consumer is currently rendering compiled-in fallback data. */
  readonly isFallback: boolean
  /** Optional reason text to surface in the badge tooltip. */
  readonly reason?: string
}

/**
 * Tiny inline pill that lights up when a hook falls back to compiled-in
 * defaults (network failure, server stale, etc.). Renders nothing in the
 * common case so callsites can spread it freely.
 *
 * Uses the warning semantic colour so it stands out without screaming
 * "error" -- fallback data is correct, just not freshest possible.
 */
export function StaleDataBadge({ isFallback, reason }: StaleDataBadgeProps) {
  if (!isFallback) return null
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-overline font-medium bg-warning/10 text-warning border border-warning/20"
      title={reason ?? 'Showing fallback data — couldn\'t reach the live source.'}
      role="status"
    >
      <Info className="w-3 h-3" aria-hidden />
      Fallback
    </span>
  )
}
