import PageErrorState from '@/components/shared/PageErrorState'
import { PageContainer, PageHeader } from '@/components/ui'

import BillCalendarGrid from './components/BillCalendarGrid'
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
      <BillSummaryGrid summary={calendar.summary} isLoading={calendar.isLoading} />
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
        onPreviousMonth={calendar.goToPrevMonth}
        onNextMonth={calendar.goToNextMonth}
        onToday={calendar.goToToday}
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
