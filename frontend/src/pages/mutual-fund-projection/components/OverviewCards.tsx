import type { ReactNode } from 'react'

import { Calculator, CalendarRange, Percent, TrendingUp, type LucideIcon } from 'lucide-react'

import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import { formatCurrency } from '@/lib/formatters'

interface OverviewCardsProps {
  isLoading: boolean
  currentBalance: number
  primaryAccountName: string | null
  detectedMonthlySIP: number
  transactionCount: number
  totalHistoricalInvested: number
  /** Months spanned by the contribution history. A duration, not a return. */
  investmentDurationYears: number
}

interface OverviewCardProps {
  readonly icon: LucideIcon
  readonly iconClassName: string
  readonly iconBackgroundClassName: string
  readonly label: string
  readonly value: string
  readonly detail?: ReactNode
  readonly valueClassName?: string
}

function OverviewCard({
  icon: Icon,
  iconClassName,
  iconBackgroundClassName,
  label,
  value,
  detail,
  valueClassName = 'text-foreground',
}: OverviewCardProps) {
  return (
    <article className="ledger-panel p-4">
      <div className="flex min-w-0 items-start gap-3">
        <span className={`shrink-0 rounded-md p-2 ${iconBackgroundClassName}`}>
          <Icon className={`size-5 ${iconClassName}`} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <p className={`ledger-figure break-words text-xl font-semibold ${valueClassName}`}>
            {value}
          </p>
          {detail && (
            <p className="mt-1 break-words text-xs leading-relaxed text-text-tertiary">
              {detail}
            </p>
          )}
        </div>
      </div>
    </article>
  )
}

export function OverviewCards(props: Readonly<OverviewCardsProps>) {
  const {
    isLoading,
    currentBalance,
    primaryAccountName,
    detectedMonthlySIP,
    transactionCount,
    totalHistoricalInvested,
    investmentDurationYears,
  } = props

  if (isLoading) {
    return <CardGridSkeleton count={4} cols="grid-cols-1 sm:grid-cols-2 lg:grid-cols-4" />
  }

  const currentBalanceDisplay = formatCurrency(currentBalance)
  const monthlySipDisplay = formatCurrency(detectedMonthlySIP)
  const totalInvestedDisplay = formatCurrency(totalHistoricalInvested)
  const durationMonths = Math.round(investmentDurationYears * 12)
  const avgPerMonth = durationMonths > 0 ? totalHistoricalInvested / durationMonths : 0

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
      <OverviewCard
        icon={TrendingUp}
        iconClassName="text-app-purple"
        iconBackgroundClassName="bg-app-purple/15"
        label="Current Balance"
        value={currentBalanceDisplay}
        detail={primaryAccountName ?? undefined}
      />
      <OverviewCard
        icon={Calculator}
        iconClassName="text-app-green"
        iconBackgroundClassName="bg-app-green/15"
        label="Monthly SIP"
        value={monthlySipDisplay}
        detail={
          <>
            <span className="ledger-figure">{transactionCount}</span> transactions
          </>
        }
      />
      <OverviewCard
        icon={Percent}
        iconClassName="text-app-blue"
        iconBackgroundClassName="bg-app-blue/15"
        label="Total Invested"
        value={totalInvestedDisplay}
        detail="Actual contributions"
      />

      {/* Was "Realized Gain": current balance minus contributions. Both sides of
          that subtraction are the same cash flows, so the difference was only the
          stray income/expense rows booked on the account -- 1,311 on 911,000 of
          real contributions, printed as "+0.14% returns". Nothing was realised
          and no gain was measured. Contribution span is a fact the ledger holds.
          A real gain needs the Current Value input further down the page. */}
      <OverviewCard
        icon={CalendarRange}
        iconClassName="text-app-teal"
        iconBackgroundClassName="bg-app-teal/15"
        label="Contributing Since"
        value={`${durationMonths} mo`}
        valueClassName="text-app-teal"
        detail={
          <>
            <span className="ledger-figure">{formatCurrency(avgPerMonth)}</span> avg / month
          </>
        }
      />
    </div>
  )
}
