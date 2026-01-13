import { motion } from 'framer-motion'

export type TimeRange = '1M' | '3M' | '6M' | '1Y' | 'ALL'

interface TimeRangeSelectorProps {
  value: TimeRange
  onChange: (range: TimeRange) => void
}

const ranges: TimeRange[] = ['1M', '3M', '6M', '1Y', 'ALL']

export default function TimeRangeSelector({ value, onChange }: TimeRangeSelectorProps) {
  return (
    <div className="flex items-center gap-2 p-1 bg-white/5 rounded-lg border border-white/10">
      {ranges.map((range) => (
        <motion.button
          key={range}
          onClick={() => onChange(range)}
          className={`relative px-4 py-2 rounded-md text-sm font-medium transition-all ${
            value === range
              ? 'text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
          }`}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          {value === range && (
            <motion.div
              layoutId="activeTab"
              className="absolute inset-0 bg-gradient-to-r from-primary to-secondary rounded-md"
              initial={false}
              transition={{ type: 'spring', stiffness: 500, damping: 30 }}
            />
          )}
          <span className="relative z-10">{range}</span>
        </motion.button>
      ))}
    </div>
  )
}
