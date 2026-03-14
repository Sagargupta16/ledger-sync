import { CreditCard, DollarSign, Calendar, Hash } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { SummaryCard } from './SummaryCard'

interface SummaryCardsProps {
  isLoading: boolean
  summary: {
    totalMonthly: number
    totalAnnual: number
    activeCount: number
    average: number
  }
}

export function SummaryCards({ isLoading, summary }: Readonly<SummaryCardsProps>) {
  const loadingPlaceholder = '...'

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
      <SummaryCard
        icon={DollarSign}
        label="Active Monthly Cost"
        value={isLoading ? loadingPlaceholder : formatCurrency(summary.totalMonthly)}
        colorClass="text-ios-red"
        bgClass="bg-ios-red/20"
        shadowClass="shadow-ios-red/30"
        delay={0.1}
      />
      <SummaryCard
        icon={Calendar}
        label="Annual Projection"
        value={isLoading ? loadingPlaceholder : formatCurrency(summary.totalAnnual)}
        colorClass="text-ios-orange"
        bgClass="bg-ios-orange/20"
        shadowClass="shadow-ios-orange/30"
        delay={0.2}
      />
      <SummaryCard
        icon={Hash}
        label="Active Subscriptions"
        value={isLoading ? loadingPlaceholder : `${summary.activeCount} active`}
        colorClass="text-ios-blue"
        bgClass="bg-ios-blue/20"
        shadowClass="shadow-ios-blue/30"
        delay={0.3}
      />
      <SummaryCard
        icon={CreditCard}
        label="Avg per Subscription"
        value={isLoading ? loadingPlaceholder : formatCurrency(summary.average)}
        colorClass="text-ios-purple"
        bgClass="bg-ios-purple/20"
        shadowClass="shadow-ios-purple/30"
        delay={0.4}
      />
    </div>
  )
}
