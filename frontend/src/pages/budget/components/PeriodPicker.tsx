import { useCallback, useEffect, useRef, useState } from 'react'

import { AnimatePresence, motion } from 'motion/react'
import { Calendar } from 'lucide-react'

import { Button, Input } from '@/components/ui'

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
 * The dialog pattern (fixed inset-0 z-50 with an opaque surface panel) mirrors
 * ConfirmDialog / AuthModal / ProfileModal / CommandPalette --
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
  const triggerRef = useRef<HTMLButtonElement>(null)
  const startInputRef = useRef<HTMLInputElement>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const handleClose = useCallback(() => {
    setShowCustom(false)
    requestAnimationFrame(() => triggerRef.current?.focus())
  }, [])

  useEffect(() => {
    if (!showCustom) return
    requestAnimationFrame(() => startInputRef.current?.focus())
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose()
        return
      }
      if (e.key !== 'Tab') return

      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'input, button:not([disabled])',
      )
      if (!focusable || focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [showCustom, handleClose])

  const minAttr = minDate ? minDate.slice(0, 10) : undefined
  const maxAttr = maxDate ? maxDate.slice(0, 10) : undefined
  const canApply = customStart && customEnd && customStart <= customEnd

  return (
    <>
      <div className="w-full overflow-x-auto pb-1 sm:w-auto sm:pb-0">
        <div
          className="flex w-max items-center gap-1 rounded-lg border border-[var(--hairline-1)] bg-[var(--overlay-2)] p-1"
          role="group"
          aria-label="Budget period"
        >
          {OPTIONS.map(([v, label]) => (
            <motion.button
              key={v}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(v)}
              className={`relative min-h-11 min-w-11 shrink-0 rounded-md px-3 py-2.5 text-sm font-medium transition-colors lg:pointer-fine:min-h-8 lg:pointer-fine:py-1.5 ${
                value === v
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:bg-[var(--overlay-5)] hover:text-foreground'
              }`}
              whileTap={{ scale: 0.97 }}
            >
              {value === v && (
                <motion.div
                  layoutId="budgetPeriodTab"
                  className="absolute inset-0 rounded-md bg-[var(--overlay-5)]"
                  initial={false}
                  transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </motion.button>
          ))}

          <motion.button
            ref={triggerRef}
            type="button"
            aria-pressed={value === 'custom'}
            aria-haspopup="dialog"
            aria-expanded={showCustom}
            onClick={() => setShowCustom(true)}
            className={`relative flex min-h-11 shrink-0 items-center gap-1.5 rounded-md px-3 py-2.5 text-sm font-medium transition-colors lg:pointer-fine:min-h-8 lg:pointer-fine:py-1.5 ${
              value === 'custom'
                ? 'text-foreground'
                : 'text-muted-foreground hover:bg-[var(--overlay-5)] hover:text-foreground'
            }`}
            whileTap={{ scale: 0.97 }}
          >
            {value === 'custom' && (
              <motion.div
                layoutId="budgetPeriodTab"
                className="absolute inset-0 rounded-md bg-[var(--overlay-5)]"
                initial={false}
                transition={{ type: 'spring', stiffness: 500, damping: 35 }}
              />
            )}
            <Calendar className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
            <span className="relative z-10">Custom</span>
          </motion.button>
        </div>
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
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby="custom-range-title"
              aria-describedby="custom-range-description"
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="w-full max-w-md rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-4 shadow-[var(--glass-shadow-strong)] sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
              <h3
                id="custom-range-title"
                className="text-lg font-semibold text-foreground mb-1"
              >
                Custom date range
              </h3>
              <p id="custom-range-description" className="mb-5 text-sm text-muted-foreground">
                Pick any start and end date. Bounds are set from your earliest
                and latest transactions.
              </p>

              <div className="space-y-4">
                <Input
                  ref={startInputRef}
                  id="budget-custom-start"
                  label="From"
                  type="date"
                  value={customStart}
                  min={minAttr}
                  max={customEnd || maxAttr}
                  onChange={(e) => onCustomChange(e.target.value, customEnd)}
                />
                <Input
                  id="budget-custom-end"
                  label="To"
                  type="date"
                  value={customEnd}
                  min={customStart || minAttr}
                  max={maxAttr}
                  onChange={(e) => onCustomChange(customStart, e.target.value)}
                />
              </div>

              <div className="mt-6 flex justify-end gap-2">
                <Button
                  type="button"
                  onClick={handleClose}
                  variant="secondary"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={!canApply}
                  onClick={() => {
                    onChange('custom')
                    handleClose()
                  }}
                >
                  Apply
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
