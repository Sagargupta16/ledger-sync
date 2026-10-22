import { useState } from 'react'

import { AlertTriangle, DatabaseBackup } from 'lucide-react'

import { Button, Card } from '@/components/ui'
import { cn } from '@/lib/cn'

import { formatCount } from '../moneyManagerUtils'
import type { BackupReview } from '../useMoneyManagerImport'

interface MoneyManagerReviewProps {
  readonly review: BackupReview
  readonly isBusy: boolean
  readonly onConfirm: () => Promise<void>
  readonly onCancel: () => void
}

export default function MoneyManagerReview({
  review,
  isBusy,
  onConfirm,
  onCancel,
}: MoneyManagerReviewProps) {
  const [confirmed, setConfirmed] = useState(false)
  const { fileName, preview, force } = review
  const { summary, stats } = preview
  const contents = [
    { label: 'Transactions', value: summary.transactions },
    { label: 'Transfers', value: summary.transfers },
    { label: 'Accounts', value: summary.accounts },
  ]
  const changes = [
    { label: 'Added', value: stats.inserted, tone: 'text-foreground' },
    { label: 'Updated', value: stats.updated, tone: 'text-foreground' },
    { label: 'Removed', value: stats.deleted, tone: stats.deleted > 0 ? 'text-app-red' : 'text-foreground' },
    { label: 'Unchanged', value: stats.unchanged, tone: 'text-muted-foreground' },
  ]

  return (
    <section aria-labelledby="backup-review-title">
      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <DatabaseBackup className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="backup-review-title" className="text-lg font-semibold text-foreground">
              Review your Money Manager backup
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{fileName}</p>
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-4 border-y border-border py-4">
          {contents.map(({ label, value }) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                {formatCount(value)}
              </dd>
            </div>
          ))}
        </dl>

        <dl className="text-sm">
          <dt className="text-muted-foreground">Dates in this backup</dt>
          <dd className="mt-1 font-mono text-foreground">
            {summary.first_date && summary.last_date
              ? `${summary.first_date} to ${summary.last_date}`
              : 'No dated entries'}
          </dd>
        </dl>

        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">What this import changes</h3>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {changes.map(({ label, value, tone }) => (
              <div key={label} className="min-w-0 rounded-md border border-border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={cn('mt-1 font-mono text-lg font-semibold tabular-nums', tone)}>
                  {formatCount(value)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs leading-5 text-muted-foreground">
            The server counted these in a dry run. Nothing is saved until you confirm.
          </p>
        </div>

        <div className="flex items-start gap-3 rounded-md border border-app-yellow/30 bg-app-yellow/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-text" aria-hidden="true" />
          <div className="min-w-0 space-y-2 text-sm leading-6">
            <p className="font-semibold text-foreground">Scope: your entire ledger</p>
            <p className="text-muted-foreground">
              Existing entries missing from this backup will be removed, including any added
              from Excel or CSV files.
            </p>
            {force && (
              <p className="text-foreground">
                This backup was imported before. Continuing reapplies it as your full snapshot.
              </p>
            )}
          </div>
        </div>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={isBusy}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span>
            This backup is my complete Money Manager ledger; rows missing from it are removed.
          </span>
        </label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onCancel} disabled={isBusy}>
            Cancel import
          </Button>
          <Button
            onClick={() => void onConfirm()}
            disabled={!confirmed || isBusy}
            isLoading={isBusy}
            className="whitespace-normal text-center"
          >
            Replace ledger with this backup
          </Button>
        </div>
      </Card>
    </section>
  )
}
