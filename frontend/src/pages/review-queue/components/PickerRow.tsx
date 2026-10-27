import type { ReactNode } from 'react'

export const PICKER_ROW =
  'flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--overlay-3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:pointer-events-none disabled:opacity-50'

interface PickerRowProps {
  /** The accessible name; the current label adds ", current category". */
  readonly name: string
  readonly isCurrent: boolean
  readonly onPick: () => void
  /** The visible label. */
  readonly children: ReactNode
  /** Shown at the end of the row unless the row is the current label. */
  readonly aside?: ReactNode
}

/** One label to pick. The row's own label is listed too, marked Current and disabled. */
export default function PickerRow({ name, isCurrent, onPick, children, aside }: PickerRowProps) {
  return (
    <button
      type="button"
      className={PICKER_ROW}
      disabled={isCurrent}
      aria-label={isCurrent ? `${name}, current category` : name}
      onClick={onPick}
    >
      {children}
      {isCurrent ? <span className="ledger-meta shrink-0 text-text-tertiary">Current</span> : aside}
    </button>
  )
}
