import { motion } from 'framer-motion'

export type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

const ranges: TimeRange[] = ['1M', '3M', '6M', '1Y', 'ALL']

export default function TimeRangeSelector({ value, onChange }: Readonly<TimeRangeSelectorProps>) {
  return (
    <div className="flex gap-1 p-1 bg-white/[0.04] rounded-lg" role="tablist" aria-label="Time range selector">
      {ranges.map((range) => (
        <motion.button
          key={range}
          role="tab"
          aria-selected={value === range}
          onClick={() => onChange(range)}
          className={`relative px-4 py-2 rounded-md text-sm transition-colors duration-150 ease-out ${
            value === range
              ? 'text-white font-medium'
              : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]'
          }`}
          whileTap={{ scale: 0.97 }}
        >
          {value === range && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-white/[0.10] rounded-md"
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
