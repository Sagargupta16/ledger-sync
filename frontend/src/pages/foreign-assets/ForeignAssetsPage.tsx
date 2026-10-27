import { Download, Globe, Settings2 } from 'lucide-react'
import { Link } from 'react-router'

import EmptyState from '@/components/shared/EmptyState'
import { PageSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { Button, PageContainer, PageHeader, StickyToolbar } from '@/components/ui'
import { ROUTES } from '@/constants'

import EventsPanel from './components/EventsPanel'
import FastDsCard from './components/FastDsCard'
import LotLedgerTable from './components/LotLedgerTable'
import ScheduleFaSection from './components/ScheduleFaSection'
import YearPicker from './components/YearPicker'
import { COMPUTATION_NOTE } from './foreignAssetsLabels'
import { downloadScheduleFaCsv } from './scheduleFaCsv'
import { useForeignAssets } from './useForeignAssets'

const TITLE = 'Foreign Assets'
const SUBTITLE =
  'Schedule FA worksheet for RSU shares of a foreign employer: lots, peak and closing values per calendar year, and the FAST-DS 2026 check.'

const settingsLink = (
  <Link
    to={ROUTES.SETTINGS}
    className="inline-flex min-h-11 items-center justify-center gap-2 self-start whitespace-nowrap rounded-lg border border-border bg-[var(--overlay-2)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--overlay-5)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8 lg:pointer-fine:py-1.5"
  >
    <Settings2 className="size-4" aria-hidden="true" />
    <span>RSU grants</span>
  </Link>
)

export default function ForeignAssetsPage() {
  const model = useForeignAssets()
  const { lots, schedule } = model

  if (lots.isError) {
    return (
      <PageErrorState
        title={TITLE}
        subtitle={SUBTITLE}
        message="We couldn't load your RSU lots. Your saved records are unchanged. Try again."
        onRetry={() => void lots.refetch()}
        action={settingsLink}
      />
    )
  }

  const report = schedule.data
  return (
    <PageContainer>
      <PageHeader title={TITLE} subtitle={SUBTITLE} action={settingsLink} />

      {model.hasLots && (
        <StickyToolbar label="Schedule FA year and export" className="flex flex-wrap items-center gap-3">
          <YearPicker
            years={model.years}
            year={model.year}
            currentYear={lots.data?.current_year ?? 0}
            onChange={model.setYear}
          />
          <Button
            variant="secondary"
            size="sm"
            icon={<Download className="size-4" aria-hidden="true" />}
            disabled={!report || schedule.isPlaceholderData}
            onClick={() => report && downloadScheduleFaCsv(report)}
          >
            Export CSV
          </Button>
        </StickyToolbar>
      )}

      {lots.isLoading && <PageSkeleton />}

      {lots.isSuccess && !model.hasLots && (
        <EmptyState
          icon={Globe}
          title="No vested RSU lots yet"
          description="Add your RSU grants and vest dates in Settings, under Income and Salary Structure. Each vest that has happened becomes a lot here."
          actionLabel="Open Settings"
          actionHref={ROUTES.SETTINGS}
        />
      )}

      {model.hasLots && lots.data && (
        <div className="space-y-6 md:space-y-8">
          <div className="space-y-2 border-b border-[var(--hairline-1)] pb-4">
            <p className="text-xs leading-5 text-muted-foreground">
              Schedule FA covers the calendar year (1 Jan to 31 Dec), not the financial year. For AY
              2026-27 that is 2025, under the Income-tax Act 1961. {COMPUTATION_NOTE}
            </p>
            {lots.data.warnings.map((warning, index) => (
              <p key={`${index}-${warning}`} className="text-xs text-app-orange">{warning}</p>
            ))}
          </div>
          <FastDsCard query={model.fastDs} />
          <ScheduleFaSection query={schedule} year={model.year} />
          <LotLedgerTable lots={lots.data.lots} />
          <EventsPanel ledger={lots.data} readOnly={model.isDemoMode} />
        </div>
      )}
    </PageContainer>
  )
}
