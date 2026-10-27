import { useId } from 'react'

import { CalendarClock, CalendarDays, CalendarRange, ShoppingBag, Sparkles, TrendingDown, TrendingUp } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import MetricCard from '@/components/shared/MetricCard'
import { Button } from '@/components/ui'
import { ROUTES } from '@/constants'
import { useExplainWeeklyRecap, useWeeklyRecap } from '@/hooks/api/useWeeklyRecap'
import { useDemoGuard } from '@/hooks/useDemoGuard'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { formatCurrency } from '@/lib/formatters'
import type { WeeklyRecap } from '@/services/api/weeklyRecap'

import { ExplanationPanel, FlagsPanel, IncompleteWeekNotice, MoversPanel, RecapLink, UpcomingPanel } from './WeeklyRecapPanels'
import { buildRecapFacts, countLabel, daysText, ordinalDay, recapDay, signedMoney } from './weeklyRecapFacts'

function averageLabel(weeks: number): string {
  if (weeks === 0) return 'no earlier full week'
  return weeks === 1 ? 'the week before' : `the ${weeks}-week average`
}

function RecapTiles({ recap }: Readonly<{ recap: WeeklyRecap }>) {
  const { spending, net_worth: netWorth, bills, payday, week } = recap
  const next = bills.items[0]
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard
        title="Spent last week"
        value={formatCurrency(spending.this_week)}
        icon={ShoppingBag}
        color="red"
        invertChange
        change={spending.change_pct ?? undefined}
        changeLabel={`vs ${averageLabel(week.baseline_weeks)}`}
        subtitle={spending.weekly_average === null ? 'No earlier full week to compare.' : `Weekly average ${formatCurrency(spending.weekly_average)}`}
        titleInfo="Expense rows in the week, without the realised losses you classified."
      />
      <MetricCard
        title="Net worth change"
        value={signedMoney(netWorth.change)}
        icon={netWorth.change < 0 ? TrendingDown : TrendingUp}
        color={netWorth.change < 0 ? 'red' : 'green'}
        subtitle={netWorth.driver ? `Biggest driver: ${netWorth.driver.category}, ${signedMoney(netWorth.driver.amount)}` : 'No income or spending recorded.'}
        titleInfo="Book value: the week's income minus every expense row, as the ledger records it."
      />
      <MetricCard
        title="Recurring bills due in 7 days"
        value={formatCurrency(bills.total)}
        icon={CalendarClock}
        color="orange"
        href={ROUTES.BILL_CALENDAR}
        subtitle={next ? `${countLabel(bills.items.length, 'commitment')}, next ${next.name} ${daysText(next.days_until)}` : 'Nothing recurring falls due.'}
        titleInfo="Recurring expense commitments due today or in the next 7 days. Card statement dues are on the bill calendar."
      />
      <MetricCard
        title="Days to payday"
        value={payday.days_until === 0 ? 'Today' : countLabel(payday.days_until, 'day')}
        icon={CalendarDays}
        color="blue"
        href={ROUTES.SETTINGS}
        subtitle={`${recapDay(payday.next_date)}, payday on the ${ordinalDay(payday.day_of_month)} (Settings)`}
      />
    </div>
  )
}

type RecapExplain = ReturnType<typeof useExplainWeeklyRecap>

/** The Explain button with what a click costs, or the way to set AI up. */
function ExplainControl({ explain, onExplain }: Readonly<{ explain: RecapExplain; onExplain: () => void }>) {
  const costId = useId()
  if (!explain.isConfigured && !explain.isDemoMode) {
    return <RecapLink to={ROUTES.SETTINGS}>Set up AI to explain</RecapLink>
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        variant="secondary"
        size="sm"
        icon={<Sparkles className="size-3.5" />}
        isLoading={explain.isPending}
        disabled={explain.isConfigLoading}
        onClick={onExplain}
        aria-describedby={costId}
      >
        {explain.narrative ? 'Explain again' : 'Explain'}
      </Button>
      <span id={costId} className="text-[11px] leading-4 text-text-tertiary">Uses one AI message</span>
    </div>
  )
}

function RecapBody({ recap }: Readonly<{ recap: WeeklyRecap }>) {
  const { week } = recap
  const explain = useExplainWeeklyRecap(buildRecapFacts(recap))
  const { guardDemoAction } = useDemoGuard()
  const onExplain = () => {
    if (!guardDemoAction('AI explain')) explain.explain()
  }
  let status = ''
  if (explain.isPending) status = 'Writing the explanation.'
  else if (explain.narrative) status = 'Explanation ready.'

  return (
    <section aria-labelledby="weekly-recap-heading" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="weekly-recap-heading" className="text-sm font-semibold text-foreground">Weekly recap</h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            {recapDay(week.start)} to {recapDay(week.end)}, against {averageLabel(week.baseline_weeks)}.
          </p>
        </div>
        <ExplainControl explain={explain} onExplain={onExplain} />
      </div>
      <p className="sr-only" aria-live="polite">{status}</p>
      {explain.error && (
        <p role="alert" className="text-xs leading-5 text-app-red">
          {getApiErrorMessage(explain.error, 'The explanation could not be written. Try again.')}
        </p>
      )}
      {explain.narrative && <ExplanationPanel narrative={explain.narrative} />}
      {!week.is_complete && week.data_through && <IncompleteWeekNotice dataThrough={week.data_through} href={ROUTES.UPLOAD} />}
      <RecapTiles recap={recap} />
      <div className="grid gap-3 md:grid-cols-2">
        <MoversPanel
          movers={recap.movers}
          averageLabel={averageLabel(week.baseline_weeks)}
          footer={<RecapLink to={ROUTES.SPENDING_ANALYSIS}>Spending analysis</RecapLink>}
        />
        <UpcomingPanel bills={recap.bills} href={ROUTES.BILL_CALENDAR} />
      </div>
      {recap.anomaly_count > 0 && <FlagsPanel anomalies={recap.anomalies} count={recap.anomaly_count} href={ROUTES.ANOMALIES} />}
      <p className="text-xs leading-5 text-text-tertiary">
        Book values from your ledger, with weeks running Monday to Sunday in India time. A computation aid, not financial advice.
      </p>
    </section>
  )
}

/** Monday recap of the last full IST week, for the Dashboard. */
export default function WeeklyRecapCard() {
  const { data: recap, isLoading, isError, refetch } = useWeeklyRecap()

  if (isLoading) return <PanelSkeleton blockClassName="h-28" blocks={2} />
  // `!recap?.week` also catches a payload of the wrong shape (an unrouted demo
  // GET answers `[]`), which would otherwise throw on `week.data_from`.
  if (isError || !recap?.week) {
    return (
      <ErrorState
        variant="inline"
        message="The weekly recap could not be loaded. No figure has been replaced with zero."
        onRetry={() => { void refetch() }}
      />
    )
  }
  const { week } = recap
  if (week.data_from && week.data_from <= week.end) return <RecapBody recap={recap} />
  if (week.data_from) {
    return (
      <EmptyState
        variant="card"
        icon={CalendarRange}
        title="Your first weekly recap is on its way"
        description={`Your ledger starts on ${recapDay(week.data_from)}. A recap covers a full Monday to Sunday week and appears the Monday after one.`}
      />
    )
  }
  return (
    <EmptyState
      variant="card"
      icon={CalendarRange}
      title="No weekly recap yet"
      description="Upload transactions and a recap of each full Monday to Sunday week appears here."
      actionLabel="Upload Data"
      actionHref={ROUTES.UPLOAD}
    />
  )
}
