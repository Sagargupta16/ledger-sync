import { RefreshCw, ShieldCheck } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { CardGridSkeleton, ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { Button, PageContainer, PageHeader } from '@/components/ui'
import { isForbidden, useAdminStats, useIsAdmin } from '@/hooks/api/useAdminStats'
import { useDemoStore } from '@/store/demoStore'

import { formatAsOf } from './adminFormat'
import AdminAiChart from './components/AdminAiChart'
import AdminMetricGrid from './components/AdminMetricGrid'
import FundingBreakdown from './components/FundingBreakdown'

const TITLE = 'Admin'
const SUBTITLE =
  "App-wide totals across every account. Counts only: no account's transactions, names or emails are shown here."

function NotAvailable({ demo }: Readonly<{ demo: boolean }>) {
  return (
    <PageContainer>
      <PageHeader title={TITLE} subtitle={SUBTITLE} />
      <EmptyState
        icon={ShieldCheck}
        title={demo ? 'Not available in demo mode' : 'Admins only'}
        description={
          demo
            ? 'The admin page reads the real server. Sign in with an admin account to open it.'
            : 'This page is for the accounts the server owner lists in LEDGER_SYNC_ADMIN_EMAILS.'
        }
        variant="card"
      />
    </PageContainer>
  )
}

/**
 * Owner stats: how many accounts use the app, how much ledger it holds, and
 * what the AI costs, from `GET /api/admin/stats`. Only admins reach the data;
 * everyone else, and demo mode, gets an explanation instead.
 */
export default function AdminPage() {
  const isAdmin = useIsAdmin()
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const { data, isPending, isError, error, refetch, isFetching } = useAdminStats()

  if (!isAdmin || (isError && isForbidden(error))) return <NotAvailable demo={isDemoMode} />
  if (isError) {
    return <PageErrorState title={TITLE} subtitle={SUBTITLE} onRetry={() => void refetch()} />
  }

  return (
    <PageContainer>
      <PageHeader
        title={TITLE}
        subtitle={SUBTITLE}
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => void refetch()} disabled={isFetching}
            aria-label="Refresh totals">
            <RefreshCw className={`size-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </Button>
        }
      />
      {isPending ? (
        <>
          <CardGridSkeleton count={8} cols="grid-cols-2 lg:grid-cols-4" />
          <ChartSkeleton height="h-64" />
        </>
      ) : (
        <>
          <AdminMetricGrid stats={data} />
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <div className="min-w-0 lg:col-span-2">
              <AdminAiChart daily={data.ai.daily} />
            </div>
            <FundingBreakdown rows={data.ai.by_funding_30d} />
          </div>
          <p className="text-xs text-muted-foreground">As of {formatAsOf(data.as_of)}</p>
        </>
      )}
    </PageContainer>
  )
}
