import type { ReactNode } from 'react'

import { BellRing, ChevronDown } from 'lucide-react'

import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button } from '@/components/ui'
import { useBankAlerts, useSetBankAlertIgnored } from '@/hooks/api/useBankAlerts'
import { formatDate } from '@/lib/formatters'
import type { BankAlert, BankAlertList } from '@/services/api/bankAlerts'
import { useDemoStore } from '@/store/demoStore'

import BankAlertRow from './BankAlertRow'
import BankAlertsSetup from './BankAlertsSetup'

const HEADING_ID = 'bank-alerts-heading'

function Shell({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <section className="ledger-panel space-y-4 p-4" aria-labelledby={HEADING_ID}>
      <div className="flex items-center gap-2">
        <BellRing className="size-4 shrink-0 text-app-blue" aria-hidden />
        <h2 id={HEADING_ID} className="text-sm font-semibold text-foreground">
          Bank alerts not in your ledger
        </h2>
      </div>
      {children}
    </section>
  )
}

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}

/**
 * One line on what the list shows. Counted from `alerts` rather than `counts`, so
 * an ignore shown before its refetch lands keeps the line and the list in step.
 */
function summary(data: BankAlertList, newer: number): string {
  const from = formatDate(data.since)
  const count = (status: BankAlert['status']) => data.alerts.filter((alert) => alert.status === status).length
  const [matched, missing, ignored] = [count('matched'), count('missing'), count('ignored')]
  let text: string
  if (missing > 0) {
    text = `${plural(missing, 'alert', 'alerts')} since ${from} ${missing === 1 ? 'has' : 'have'} no matching ledger row.`
    const advice = missing === 1
      ? ' Add it in Money Manager, or ignore it if you do not log it.'
      : ' Add them in Money Manager, or ignore the ones you do not log.'
    text += newer === 0
      ? advice
      : ` ${newer} arrived after your last backup, so the next backup may still bring ${newer === 1 ? 'it' : 'them'}.`
  } else if (ignored > 0) {
    text = `No missing bank alerts since ${from}: ${matched} matched a ledger row and ${ignored} ${ignored === 1 ? 'is' : 'are'} ignored.`
  } else {
    text = `Every bank alert since ${from} has a matching ledger row.`
  }
  if (data.truncated) text += ` Alerts older than ${from} are left out because there are too many to check at once.`
  return text
}

function LoadError({ onRetry }: Readonly<{ onRetry: () => void }>) {
  return (
    <div className="flex flex-wrap items-center gap-2" role="alert">
      <p className="min-w-0 flex-1 text-xs text-app-red">
        We could not read your bank alerts. Your ledger is not affected.
      </p>
      <Button variant="outline" size="sm" onClick={onRetry}>
        Try again
      </Button>
    </div>
  )
}

function AlertList({ data }: Readonly<{ data: BankAlertList }>) {
  const ignore = useSetBankAlertIgnored()
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const missing = data.alerts.filter((alert) => alert.status === 'missing')
  const ignored = data.alerts.filter((alert) => alert.status === 'ignored')
  const newer = missing.filter((alert) => alert.after_last_import).length
  const pendingId = ignore.isPending ? ignore.variables?.id : undefined
  const row = (alert: BankAlert, actionLabel: string, ignoredValue: boolean) => (
    <BankAlertRow
      key={alert.id}
      alert={alert}
      actionLabel={actionLabel}
      onAction={() => ignore.mutate({ id: alert.id, ignored: ignoredValue })}
      isPending={pendingId === alert.id}
      disabled={isDemoMode || ignore.isPending}
    />
  )

  return (
    <>
      <p className="text-xs leading-5 text-text-tertiary">{summary(data, newer)}</p>
      {missing.length > 0 && (
        <ul className="divide-y divide-[var(--hairline-1)]">{missing.map((alert) => row(alert, 'Ignore', true))}</ul>
      )}
      {ignored.length > 0 && (
        <details className="group/ignored">
          <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md text-xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8">
            <span>Ignored ({ignored.length})</span>
            <ChevronDown
              className="size-4 transition-transform duration-150 group-open/ignored:rotate-180"
              aria-hidden
            />
          </summary>
          <ul className="divide-y divide-[var(--hairline-1)]">{ignored.map((alert) => row(alert, 'Restore', false))}</ul>
        </details>
      )}
      {ignore.isError && !ignore.isPending && (
        <p className="text-xs text-app-red" role="alert">
          That did not save, so nothing changed. Try again.
        </p>
      )}
      <p className="text-[11px] leading-4 text-text-tertiary">
        {isDemoMode && 'Demo data: ignoring alerts is turned off. '}
        An alert counts as logged when a ledger row has the same amount, a date within{' '}
        {data.window_days} days and a fitting account. This is a computation aid for checking
        completeness, not financial advice.
      </p>
    </>
  )
}

/**
 * Bank alerts (SMS or email a Shortcut forwards) that no ledger row answers.
 *
 * The match runs on the server against the current ledger on every read, so an
 * import or an edit in Money Manager clears an alert without any action here.
 * Ignoring is for spends the user deliberately does not log.
 */
export default function BankAlertsPanel() {
  const query = useBankAlerts()

  if (query.isPending) return <PanelSkeleton blocks={2} blockClassName="h-12" />
  return (
    <Shell>
      {query.isError && <LoadError onRetry={() => void query.refetch()} />}
      {query.isSuccess && (query.data.alerts.length === 0 ? <BankAlertsSetup /> : <AlertList data={query.data} />)}
    </Shell>
  )
}
