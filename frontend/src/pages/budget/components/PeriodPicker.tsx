import { useCallback, useEffect, useState } from 'react'

import { AnimatePresence, motion } from 'framer-motion'
import { Calendar } from 'lucide-react'

/**
 * Value model:
 * - Preset periods are string literals (fast path, no date math from user).
 * - 'custom' means the caller reads `customStart` / `customEnd` from the
 *   controlled state instead of running toPeriodRange().
 */
export type PresetPeriod =
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months'
  | 'last_2_years'
  | 'last_5_years'
  | 'all_time'
  | 'this_fy'
  | 'custom'

const OPTIONS: ReadonlyArray<readonly [PresetPeriod, string]> = [
  ['last_3_months', '3 mo'],
  ['last_6_months', '6 mo'],
  ['last_12_months', '1 yr'],
  ['last_2_years', '2 yr'],
  ['last_5_years', '5 yr'],
  ['all_time', 'All'],
  ['this_fy', 'FY'],
]

interface Props {
  readonly value: PresetPeriod
  readonly onChange: (v: PresetPeriod) => void
  readonly customStart: string
  readonly customEnd: string
  readonly onCustomChange: (start: string, end: string) => void
  /** ISO of the earliest txn (from useDataDateRange). Bounds the custom min. */
  readonly minDate?: string
  /** ISO of the latest txn. Bounds the custom max. */
  readonly maxDate?: string
}

/**
 * Preset pill bar + "Custom" trigger that opens a full-screen dialog.
 *
 * The dialog pattern (fixed inset-0 z-50 with backdrop-blur + bg-surface-dropdown
 * panel) mirrors ConfirmDialog / AuthModal / ProfileModal / CommandPalette --
 * the app's canonical overlay shape. Previous version rendered the popover
 * inline inside the sticky header, which pushed the flex layout wide and got
 * clipped by page content.
 */
export function PeriodPicker({
  value,
  onChange,
  customStart,
  customEnd,
  onCustomChange,
  minDate,
  maxDate,
}: Props) {
  const [showCustom, setShowCustom] = useState(false)
  const handleClose = useCallback(() => setShowCustom(false), [])

  useEffect(() => {
    if (!showCustom) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showCustom, handleClose])

  const minAttr = minDate ? minDate.slice(0, 10) : undefined
  const maxAttr = maxDate ? maxDate.slice(0, 10) : undefined
  const canApply = customStart && customEnd && customStart <= customEnd

  return (
    <>
      <div
        className="scrollbar-none flex w-full max-w-full items-center gap-1 overflow-x-auto rounded-lg border border-[var(--hairline-1)] bg-[var(--overlay-2)] p-1 sm:w-auto"
        role="tablist"
        aria-label="Select period"
      >
        {OPTIONS.map(([v, label]) => (
          <motion.button
            key={v}
            role="tab"
            aria-selected={value === v}
            onClick={() => onChange(v)}
            className={`relative min-h-11 shrink-0 rounded-md px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-8 sm:py-1.5 ${
              value === v
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)]'
            }`}
            whileTap={{ scale: 0.97 }}
          >
            {value === v && (
              <motion.div
                layoutId="budgetPeriodTab"
                className="absolute inset-0 rounded-lg bg-[var(--overlay-5)]"
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <span className="relative z-10">{label}</span>
          </motion.button>
        ))}

        <motion.button
          role="tab"
          aria-selected={value === 'custom'}
          aria-haspopup="dialog"
          aria-expanded={showCustom}
          onClick={() => setShowCustom(true)}
          className={`relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors sm:min-h-8 sm:py-1.5 ${
            value === 'custom'
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)]'
          }`}
          whileTap={{ scale: 0.97 }}
        >
          {value === 'custom' && (
            <motion.div
              layoutId="budgetPeriodTab"
              className="absolute inset-0 rounded-lg bg-[var(--overlay-5)]"
              initial={false}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <Calendar className="w-3.5 h-3.5 relative z-10" aria-hidden="true" />
          <span className="relative z-10">Custom</span>
        </motion.button>
      </div>

      <AnimatePresence>
        {showCustom && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--modal-backdrop)] p-4"
            onClick={handleClose}
          >
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="custom-range-title"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-6 shadow-[var(--glass-shadow-strong)]"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="custom-range-title"
                className="text-lg font-semibold text-foreground mb-1"
              >
                Custom date range
              </h3>
              <p className="text-sm text-muted-foreground mb-5">
                Pick any start and end date. Bounds are set from your earliest
                and latest transactions.
              </p>

              <div className="space-y-4">
                <label className="block text-xs font-medium text-muted-foreground">
                  <span className="block">From</span>
                  <input
                    type="date"
                    value={customStart}
                    min={minAttr}
                    max={customEnd || maxAttr}
                    onChange={(e) => onCustomChange(e.target.value, customEnd)}
                    className="mt-1.5 block w-full px-3 py-2 rounded-lg bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-app-blue/50 focus:border-app-blue"
                  />
                </label>
                <label className="block text-xs font-medium text-muted-foreground">
                  <span className="block">To</span>
                  <input
                    type="date"
                    value={customEnd}
                    min={customStart || minAttr}
                    max={maxAttr}
                    onChange={(e) => onCustomChange(customStart, e.target.value)}
                    className="mt-1.5 block w-full px-3 py-2 rounded-lg bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-app-blue/50 focus:border-app-blue"
                  />
                </label>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={handleClose}
                  className="px-4 py-2 bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-foreground rounded-lg hover:bg-[var(--overlay-5)] transition-colors duration-150 ease-out text-sm"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!canApply}
                  onClick={() => {
                    onChange('custom')
                    handleClose()
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-app-blue/90 hover:bg-app-blue text-on-accent transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
