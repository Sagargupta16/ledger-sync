import { RefreshCw, ShieldCheck } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import { CardGridSkeleton, ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import PageErrorState from '@/components/shared/PageErrorState'
import { Button, PageContainer, PageHeader } from '@/components/ui'
import { isForbidden, useAdminStats, useIsAdmin } from '@/hooks/api/useAdminStats'
import { useDemoStore } from '@/store/demoStore'

import { PROVIDER_LABELS, formatAsOf } from './adminFormat'
import AdminAiChart from './components/AdminAiChart'
import AdminAppInfo from './components/AdminAppInfo'
import AdminBreakdown from './components/AdminBreakdown'
import AdminCountChart from './components/AdminCountChart'
import AdminMetricGrid from './components/AdminMetricGrid'
import AdminModelsTable from './components/AdminModelsTable'
import AdminUsersTable from './components/AdminUsersTable'
import FundingBreakdown from './components/FundingBreakdown'

const TITLE = 'Admin'
const SUBTITLE =
  "App-wide totals, the accounts with masked emails, AI usage and the server's health. No account's transactions, amounts or full emails are shown here."

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
              <AdminCountChart id="admin-signups" title="Sign-ups per month" summary="sign-ups in 12 months"
                rows={data.users.signups_by_month} labelKey="month" valueKey="signups" seriesLabel="Sign-ups"
                rowHeaderLabel="Month" tone="income"
                ariaLabel="Bar chart of new accounts per month over the last 12 months" />
            </div>
            <AdminBreakdown id="admin-providers" title="Sign-in providers"
              rows={(['google', 'github', 'other'] as const).map((key) => ({
                key, label: PROVIDER_LABELS[key], value: data.users.by_provider[key],
              }))}
              note="Other covers accounts created before provider sign-in was recorded." />
          </div>
          <AdminUsersTable users={data.users} />
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <div className="min-w-0 lg:col-span-2">
              <AdminAiChart daily={data.ai.daily} />
            </div>
            <FundingBreakdown rows={data.ai.by_funding_30d} />
          </div>
          <AdminModelsTable rows={data.ai.by_model_30d} />
          <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
            <div className="min-w-0 lg:col-span-2">
              <AdminCountChart id="admin-imports" title="Imports per day" summary="imports over 30 UTC days"
                rows={data.ledger.imports_daily} labelKey="date" valueKey="imports" seriesLabel="Imports"
                rowHeaderLabel="Day (UTC)" tone="investment"
                ariaLabel="Bar chart of statement imports per UTC day over the last 30 days, all accounts" />
            </div>
            <AdminBreakdown id="admin-types" title="Transactions by type"
              rows={(['Income', 'Expense', 'Transfer'] as const).map((key) => ({
                key, label: key, value: data.ledger.by_type[key],
              }))}
              note="Live rows across every account; counts only." />
          </div>
          <AdminAppInfo app={data.app} />
          <p className="text-xs text-muted-foreground">As of {formatAsOf(data.as_of)}</p>
        </>
      )}
    </PageContainer>
  )
}
