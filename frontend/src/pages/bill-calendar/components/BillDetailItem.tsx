import { motion } from 'framer-motion'
import { formatCurrency } from '@/lib/formatters'
import { capitalize, getBillDotColor } from '../billUtils'
import type { PlacedBill } from '../types'
import SourceBadge from './SourceBadge'

interface Props {
  bill: PlacedBill
}

export default function BillDetailItem({ bill }: Readonly<Props>) {
  const color = getBillDotColor(bill)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center justify-between gap-3 p-3 rounded-lg bg-white/5 hover:bg-white/[0.04] transition-colors"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{bill.name}</p>
            <SourceBadge source={bill.source} />
          </div>
          <p className="text-xs text-muted-foreground">
            {bill.category}
            {bill.frequency && (
              <span className="ml-2 text-text-tertiary">{capitalize(bill.frequency)}</span>
            )}
          </p>
        </div>
      </div>
      <p
        className={`text-sm font-semibold whitespace-nowrap ${bill.type === 'Income' ? 'text-app-green' : 'text-app-red'}`}
      >
        {bill.type === 'Income' ? '+' : '-'}
        {formatCurrency(bill.amount)}
      </p>
    </motion.div>
  )
}
