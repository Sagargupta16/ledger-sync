import { motion } from 'motion/react'
import { ArrowUpRight } from 'lucide-react'
import { Link } from 'react-router'
import { formatCurrency } from '@/lib/formatters'
import { capitalize, getBillDotColor } from '../billUtils'
import { CARD_STATUS_NOTE } from '../cardBills'
import type { PlacedBill } from '../types'
import SourceBadge from './SourceBadge'

interface Props {
  bill: PlacedBill
}

/** Informational card markers (paid, open cycle) are not owed, so they read muted. */
function amountTone(bill: PlacedBill): string {
  if (bill.informational) return 'text-muted-foreground'
  return bill.type === 'Income' ? 'text-app-green' : 'text-app-red'
}

/** Card status, a marker's note, or the cadence. */
function secondLine(bill: PlacedBill): string | null {
  if (bill.cardStatus) return CARD_STATUS_NOTE[bill.cardStatus]
  if (bill.note) return bill.note
  return bill.frequency ? capitalize(bill.frequency) : null
}

export default function BillDetailItem({ bill }: Readonly<Props>) {
  const color = getBillDotColor(bill)

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center justify-between gap-3 border-b border-[var(--hairline-1)] py-3 last:border-b-0"
    >
      <div className="flex items-center gap-3 min-w-0">
        <div
          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
          style={{ backgroundColor: color }}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <p className="min-w-0 text-sm font-medium text-foreground truncate">{bill.name}</p>
            <SourceBadge source={bill.source} cardStatus={bill.cardStatus} />
          </div>
          <p className="text-xs text-muted-foreground">
            {bill.category}
            {secondLine(bill) && <span className="ml-2 text-text-tertiary">{secondLine(bill)}</span>}
          </p>
        </div>
      </div>
      {bill.href ? (
        <Link
          to={bill.href}
          aria-label={`${bill.name}: see the estimate`}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          Estimate <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <p
          className={`whitespace-nowrap text-sm font-semibold tabular-nums ${amountTone(bill)}`}
        >
          {bill.type === 'Income' ? '+' : '-'}
          {formatCurrency(bill.amount)}
        </p>
      )}
    </motion.div>
  )
}
