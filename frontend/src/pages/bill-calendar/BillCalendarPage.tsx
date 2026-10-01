import { Link } from 'react-router'

import PageErrorState from '@/components/shared/PageErrorState'
import { PageContainer, PageHeader, StickyToolbar } from '@/components/ui'

import BillCalendarGrid from './components/BillCalendarGrid'
import BillMonthNavigator from './components/BillMonthNavigator'
import BillSummaryGrid from './components/BillSummaryGrid'
import SelectedDayPanel from './components/SelectedDayPanel'
import { useBillCalendar } from './useBillCalendar'

const PAGE_TITLE = 'Bill Calendar'
const PAGE_SUBTITLE = 'Upcoming expected payments in a monthly calendar view'

export default function BillCalendarPage() {
  const calendar = useBillCalendar()

  if (calendar.isError) {
    return (
      <PageErrorState
        title={PAGE_TITLE}
        subtitle={PAGE_SUBTITLE}
        message="We could not load your recurring transactions. Check your connection and try again."
        onRetry={calendar.retry}
      />
    )
  }

  return (
    <PageContainer className="md:space-y-6">
      <PageHeader title={PAGE_TITLE} subtitle={PAGE_SUBTITLE} />
      <StickyToolbar label="Calendar month">
        <BillMonthNavigator
          viewYear={calendar.viewYear}
          viewMonth={calendar.viewMonth}
          isCurrentViewToday={calendar.isCurrentViewToday}
          onPreviousMonth={calendar.goToPrevMonth}
          onNextMonth={calendar.goToNextMonth}
          onToday={calendar.goToToday}
        />
      </StickyToolbar>
      <BillSummaryGrid summary={calendar.summary} isLoading={calendar.isLoading} />
      {calendar.unscheduledBills.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Awaiting a due date: {calendar.unscheduledBills.map((bill) => bill.name).join(', ')}.{' '}
          These bills are not included in the calendar total.{' '}
          <Link className="text-primary underline underline-offset-4" to="/subscriptions">
            Review recurring items
          </Link>
        </p>
      )}
      <BillCalendarGrid
        now={calendar.now}
        viewYear={calendar.viewYear}
        viewMonth={calendar.viewMonth}
        selectedDay={calendar.selectedDay}
        billMap={calendar.billMap}
        calendarGrid={calendar.calendarGrid}
        maxBillAmount={calendar.summary.maxBillAmount}
        isLoading={calendar.isLoading}
        hasAnyData={calendar.hasAnyData}
        isCurrentViewToday={calendar.isCurrentViewToday}
        onSelectDay={calendar.setSelectedDay}
      />
      <SelectedDayPanel
        viewYear={calendar.viewYear}
        viewMonth={calendar.viewMonth}
        selectedDay={calendar.selectedDay}
        bills={calendar.selectedDayBills}
        onClose={() => calendar.setSelectedDay(null)}
      />
    </PageContainer>
  )
}
