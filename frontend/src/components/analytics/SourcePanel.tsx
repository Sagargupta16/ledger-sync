import { lazy, Suspense, useMemo, type ReactNode } from 'react'

import { Wallet, CreditCard, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'

import PieLegend from '@/components/shared/PieLegend'
import { capPieSlices, type PieSliceDatum } from '@/components/ui/pieSlices'
import { ROUTES } from '@/constants'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'
import EmptyState from '@/components/shared/EmptyState'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'

// Loaded on demand so the chart kit stays off the Dashboard's first-load path.
const StandardPieChart = lazy(() => import('@/components/analytics/StandardPieChart'))

const PIE_FALLBACK = <LoadingSkeleton className="h-[180px] w-full" />

type SourceKind = 'expense' | 'income'

const SOURCE_PANELS: Record<SourceKind, {
  readonly title: string
  readonly icon: LucideIcon
  readonly textClass: string
  readonly ringClass: string
  readonly route: string
  readonly ariaLabel: string
  readonly emptyTitle: string
  readonly emptyDescription: string
}> = {
  expense: {
    title: 'Expense Sources',
    icon: CreditCard,
    textClass: 'text-app-red',
    ringClass: 'focus-visible:ring-app-red/40',
    route: ROUTES.SPENDING_ANALYSIS,
    ariaLabel: 'Expense sources pie chart',
    emptyTitle: 'No expense data available',
    emptyDescription: 'No expenses were recorded in this period. Choose a wider time range to see them.',
  },
  income: {
    title: 'Income Sources',
    icon: Wallet,
    textClass: 'text-app-green',
    ringClass: 'focus-visible:ring-app-green/40',
    route: ROUTES.INCOME_ANALYSIS,
    ariaLabel: 'Income sources pie chart',
    emptyTitle: 'No income data available',
    emptyDescription: 'No income was recorded in this period. Choose a wider time range to see it.',
  },
}

export default function SourcePanel({ kind, data, total, children }: Readonly<{
  kind: SourceKind
  data: PieSliceDatum[]
  /** The Total row; the pie's own sum when omitted. */
  total?: number
  /** Rows under the Total. */
  children?: ReactNode
}>) {
  const navigate = useNavigate()
  const { title, icon: Icon, textClass, ringClass, route, ariaLabel, emptyTitle, emptyDescription } = SOURCE_PANELS[kind]

  // The legend is built from the SAME capped array the pie renders, not a
  // hand-mirrored slice count -- that drifted the moment the pie's default cap
  // changed (7 rows listed against 6 wedges, row 7 wearing a color the pie never
  // painted). One row per wedge, including the folded "Other" rollup, so the
  // rows also add up to the Total below.
  const slices = useMemo(() => capPieSlices(data), [data])
  const chartTotal = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data])

  // `void navigate(...)`: react-router types it `void | Promise<void>`, and these
  // props expect a void return. Same convention as CommandPalette and ProfileModal.
  const openCategory = (name: string) => {
    void navigate(`${route}?category=${encodeURIComponent(name)}`)
  }

  return (
    <section className="dashboard-source ledger-panel p-4 sm:p-5">
      <h2 className="mb-5 flex items-center gap-2.5 text-base font-semibold">
        <span className={`flex size-7 items-center justify-center ${textClass}`}>
          <Icon className={`size-3.5 ${textClass}`} />
        </span>
        <span>{title}</span>
      </h2>
      {data.length > 0 ? (
        <div className="dashboard-source-body">
          <Suspense fallback={PIE_FALLBACK}>
            <StandardPieChart
              data={data}
              height={180}
              showLegend={false}
              ariaLabel={ariaLabel}
              centerValue={formatCurrencyShort(chartTotal)}
              centerLabel="Total"
              onSliceClick={openCategory}
            />
          </Suspense>
          <div className="space-y-1">
            <PieLegend slices={slices} focusRingClass={ringClass} onSelect={openCategory} />
            <div className="pt-2 mt-2 border-t border-border space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Total</span>
                <span className={`text-sm font-bold ${textClass}`}>{formatCurrency(total ?? chartTotal)}</span>
              </div>
              {children}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState icon={Icon} title={emptyTitle} description={emptyDescription} variant="compact" />
      )}
    </section>
  )
}
