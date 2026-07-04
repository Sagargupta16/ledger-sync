import { motion } from 'framer-motion'

import { rawColors } from '@/constants/colors'

export type PresetPeriod = 'last_3_months' | 'last_6_months' | 'last_12_months' | 'this_fy'

const OPTIONS: ReadonlyArray<readonly [PresetPeriod, string]> = [
  ['last_3_months', 'Last 3 mo'],
  ['last_6_months', 'Last 6 mo'],
  ['last_12_months', 'Last 12 mo'],
  ['this_fy', 'This FY'],
]

interface Props {
  readonly value: PresetPeriod
  readonly onChange: (v: PresetPeriod) => void
}

export function PeriodPicker({ value, onChange }: Props) {
  return (
    <div
      className="flex items-center gap-1 p-1 glass-thin rounded-xl"
      role="tablist"
      aria-label="Select period"
    >
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
    </div>
  )
}
