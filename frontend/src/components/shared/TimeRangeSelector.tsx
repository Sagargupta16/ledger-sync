import { motion } from 'framer-motion'
import { rawColors } from '@/constants/colors'

export type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

const ranges: TimeRange[] = ['1M', '3M', '6M', '1Y', 'ALL']

export default function TimeRangeSelector({ value, onChange }: Readonly<TimeRangeSelectorProps>) {
  return (
    <div className="flex items-center gap-1 p-1 glass-thin rounded-xl" role="tablist" aria-label="Time range selector">
      {ranges.map((range) => (
        <motion.button
          key={range}
          role="tab"
          aria-selected={value === range}
          onClick={() => onChange(range)}
          className={`relative px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            value === range
              ? 'text-white'
              : 'hover:text-white hover:bg-white/10'
          }`}
          style={{ color: value === range ? undefined : rawColors.text.secondary }}
          whileTap={{ scale: 0.97 }}
        >
          {value === range && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 rounded-lg"
              style={{ backgroundColor: rawColors.ios.blue }}
              initial={false}
              transition={{ type: 'spring', stiffness: 500, damping: 35 }}
            />
          )}
          <span className="relative z-10">{range}</span>
        </motion.button>
      ))}
    </div>
  )
}
