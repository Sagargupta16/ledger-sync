/**
 * Shared loading spinner.
 *
 * One spinner for the whole app so size, color, and a11y semantics stay
 * consistent. Replaces the hand-rolled `border-app-blue/30 border-t-app-blue`
 * spinners that were copy-pasted across DropZone, Sankey, AccountClassifier,
 * and App's private fallback.
 *
 * Always renders `role="status"` so screen readers announce the busy state;
 * the visible label (or the `aria-label` fallback) names what's loading.
 */

type SpinnerSize = 'sm' | 'md' | 'lg'

/**
 * `blue` is the app accent. `current` draws in `currentColor`, for a spinner
 * inside a button or on a scrim that must keep the surrounding text color.
 */
type SpinnerTone = 'blue' | 'current'

const SIZES: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4 border-2',
  md: 'w-8 h-8 border-2',
  lg: 'w-10 h-10 border-[3px]',
}

const TONES: Record<SpinnerTone, string> = {
  blue: 'border-app-blue/30 border-t-app-blue',
  current: 'border-current/30 border-t-current',
}

interface SpinnerProps {
  /** Visible caption below the spinner. Omit for an inline/standalone spinner. */
  readonly label?: string
  readonly size?: SpinnerSize
  /** Ring color. Default `blue`. */
  readonly tone?: SpinnerTone
  readonly className?: string
}

export default function Spinner({ label, size = 'md', tone = 'blue', className = '' }: SpinnerProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Loading'}
      className={`flex flex-col items-center gap-3 ${className}`}
    >
      <div
        className={`${SIZES[size]} ${TONES[tone]} rounded-full animate-spin`}
      />
      {label && <span className="text-sm text-muted-foreground">{label}</span>}
    </div>
  )
}
