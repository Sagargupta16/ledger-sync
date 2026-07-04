import { useEffect, useRef, useState } from 'react'

import { motion } from 'framer-motion'
import { Calendar } from 'lucide-react'

import { rawColors } from '@/constants/colors'

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
  const popoverRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close on outside click / Escape. Standard controlled-popover hygiene.
  useEffect(() => {
    if (!showCustom) return
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node
      if (
        popoverRef.current &&
        !popoverRef.current.contains(t) &&
        triggerRef.current &&
        !triggerRef.current.contains(t)
      ) {
        setShowCustom(false)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowCustom(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [showCustom])

  const minAttr = minDate ? minDate.slice(0, 10) : undefined
  const maxAttr = maxDate ? maxDate.slice(0, 10) : undefined

  return (
    <div className="relative flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist" aria-label="Select period">
      {OPTIONS.map(([v, label]) => (
        <motion.button
          key={v}
          role="tab"
          aria-selected={value === v}
          onClick={() => onChange(v)}
          className={`relative px-3 py-2.5 sm:py-1.5 rounded-lg text-sm font-medium transition-colors ${
            value === v
              ? 'text-foreground'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)]'
          }`}
          whileTap={{ scale: 0.97 }}
        >
          {value === v && (
            <motion.div
              layoutId="budgetPeriodTab"
              className="absolute inset-0 rounded-lg"
              style={{ backgroundColor: rawColors.app.green }}
              initial={false}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10">{label}</span>
        </motion.button>
      ))}

      {/* Custom range trigger + popover */}
      <motion.button
        ref={triggerRef}
        role="tab"
        aria-selected={value === 'custom'}
        aria-haspopup="dialog"
        aria-expanded={showCustom}
        onClick={() => setShowCustom((s) => !s)}
        className={`relative px-3 py-2.5 sm:py-1.5 rounded-lg text-sm font-medium transition-colors flex items-center gap-1.5 ${
          value === 'custom'
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-5)]'
        }`}
        whileTap={{ scale: 0.97 }}
      >
        {value === 'custom' && (
          <motion.div
            layoutId="budgetPeriodTab"
            className="absolute inset-0 rounded-lg"
            style={{ backgroundColor: rawColors.app.green }}
            initial={false}
            transition={{ type: 'spring', stiffness: 500, damping: 35 }}
          />
        )}
        <Calendar className="w-3.5 h-3.5 relative z-10" aria-hidden="true" />
        <span className="relative z-10">Custom</span>
      </motion.button>

      {showCustom && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="Custom date range"
          className="absolute right-0 top-full mt-2 z-20 glass-card rounded-xl p-4 min-w-[280px] shadow-lg"
        >
          <div className="space-y-3">
            <label className="block text-xs font-medium text-muted-foreground">
              From
              <input
                type="date"
                value={customStart}
                min={minAttr}
                max={customEnd || maxAttr}
                onChange={(e) => onCustomChange(e.target.value, customEnd)}
                className="mt-1 block w-full px-3 py-2 rounded-lg bg-[var(--overlay-5)] text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-app-green"
              />
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              To
              <input
                type="date"
                value={customEnd}
                min={customStart || minAttr}
                max={maxAttr}
                onChange={(e) => onCustomChange(customStart, e.target.value)}
                className="mt-1 block w-full px-3 py-2 rounded-lg bg-[var(--overlay-5)] text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-app-green"
              />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => setShowCustom(false)}
                className="px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                Close
              </button>
              <button
                onClick={() => {
                  if (customStart && customEnd) {
                    onChange('custom')
                    setShowCustom(false)
                  }
                }}
                disabled={!customStart || !customEnd}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-app-green/20 text-app-green hover:bg-app-green/30 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
