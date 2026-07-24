import { Clock, DollarSign, Hash } from 'lucide-react'

import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import SummaryCard from '@/components/shared/SummaryCard'
import { formatCurrency } from '@/lib/formatters'

import type { useBillCalendar } from '../useBillCalendar'

type BillSummary = ReturnType<typeof useBillCalendar>['summary']

interface BillSummaryGridProps {
  readonly summary: BillSummary
  readonly isLoading: boolean
}

export default function BillSummaryGrid({
  summary,
  isLoading,
}: BillSummaryGridProps) {
  if (isLoading) {
    return <CardGridSkeleton count={3} cols="grid-cols-1 sm:grid-cols-3" />
  }

  const nextBill = summary.nextBill
  const daysUntil = summary.nextBillDaysUntil
  let nextBillPrimary = 'None upcoming'
  if (nextBill && daysUntil !== null) {
    if (daysUntil <= 0) nextBillPrimary = 'Due today'
    else if (daysUntil === 1) nextBillPrimary = 'Due tomorrow'
    else nextBillPrimary = `In ${daysUntil} days`
  }
  const nextBillContext = nextBill
    ? `${nextBill.name} -- ${formatCurrency(nextBill.amount)}`
    : 'Next Upcoming Bill'

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-5">
      <SummaryCard
        icon={DollarSign}
        label="Total Due This Month"
        value={formatCurrency(summary.totalDue)}
        colorClass="text-app-red"
        bgClass="bg-app-red/20"
        shadowClass="shadow-app-red/30"
        delay={0}
        compact
      />
      <SummaryCard
        icon={Hash}
        label="Bills This Month"
        value={String(summary.billCount)}
        colorClass="text-app-blue"
        bgClass="bg-app-blue/20"
        shadowClass="shadow-app-blue/30"
        delay={0.04}
        compact
      />
      <div className="col-span-2 sm:col-span-1">
        <SummaryCard
          icon={Clock}
          label={nextBillContext}
          value={nextBillPrimary}
          colorClass="text-app-orange"
          bgClass="bg-app-orange/20"
          shadowClass="shadow-app-orange/30"
          delay={0.08}
          compact
        />
      </div>
    </div>
  )
}
