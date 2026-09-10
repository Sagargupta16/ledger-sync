import { useMemo, useState } from 'react'

import { AlertTriangle, FileCheck2 } from 'lucide-react'

import { Button, Card } from '@/components/ui'

import type { UploadReview as UploadReviewState } from '../useUploadSync'

interface UploadReviewProps {
  readonly review: UploadReviewState
  readonly isBusy: boolean
  readonly onConfirm: () => Promise<void>
  readonly onCancel: () => void
}

export default function UploadReview({ review, isBusy, onConfirm, onCancel }: UploadReviewProps) {
  const [confirmed, setConfirmed] = useState(false)
  const { parsed, force } = review
  const summary = useMemo(() => {
    const accounts = new Set<string>()
    let firstDate = parsed.rows[0].date
    let lastDate = firstDate
    let income = 0
    let expenses = 0
    let transfers = 0
    for (const row of parsed.rows) {
      accounts.add(row.account)
      if (row.date < firstDate) firstDate = row.date
      if (row.date > lastDate) lastDate = row.date
      if (row.type.toLowerCase().includes('transfer')) {
        transfers += 1
        accounts.add(row.category)
      } else if (row.type.toLowerCase() === 'income') {
        income += 1
      } else {
        expenses += 1
      }
    }
    return {
      accounts: [...accounts].sort((left, right) => left.localeCompare(right)),
      firstDate, lastDate, income, expenses, transfers,
    }
  }, [parsed.rows])

  return (
    <section aria-labelledby="snapshot-review-title">
      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <FileCheck2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
          <div className="min-w-0">
            <h2 id="snapshot-review-title" className="text-lg font-semibold text-foreground">
              Review your full snapshot
            </h2>
            <p className="mt-1 break-all font-mono text-xs text-muted-foreground">
              {parsed.fileName}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-4 border-y border-border py-4 sm:grid-cols-4">
          {[
            ['Source rows', parsed.rows.length],
            ['Income rows', summary.income],
            ['Expense rows', summary.expenses],
            ['Transfer rows', summary.transfers],
          ].map(([label, count]) => (
            <div key={label} className="min-w-0">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-xl font-semibold tabular-nums text-foreground">
                {count.toLocaleString()}
              </dd>
            </div>
          ))}
        </dl>

        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">Dates in this file</dt>
            <dd className="mt-1 font-mono text-foreground">
              {summary.firstDate} to {summary.lastDate}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">Source currency</dt>
            <dd className="mt-1 font-medium text-foreground">INR</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-muted-foreground">
              Accounts in this file ({summary.accounts.length})
            </dt>
            <dd className="mt-1 break-words text-foreground">
              {summary.accounts.slice(0, 12).join(', ')}
              {summary.accounts.length > 12 && ` and ${summary.accounts.length - 12} more`}
            </dd>
          </div>
        </dl>

        <div className="flex items-start gap-3 rounded-md border border-app-yellow/30 bg-app-yellow/10 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning-text" aria-hidden="true" />
          <div className="min-w-0 space-y-2 text-sm leading-6">
            <p className="font-semibold text-foreground">Scope: your entire ledger</p>
            <p className="text-muted-foreground">
              Existing entries missing from this file will be removed, including other dates
              and accounts. Include all history you want to keep. A single month or account
              export will replace the rest of your ledger.
            </p>
            {force && (
              <p className="text-foreground">
                This file was imported before. Continuing reapplies it as your full snapshot.
              </p>
            )}
          </div>
        </div>

        <p className="text-xs leading-5 text-muted-foreground">
          Unchanged entries keep their IDs. Repeated transactions are preserved; paired
          transfer rows count as one transfer. Final change counts appear after saving.
        </p>

        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-md border border-border p-3 text-sm leading-6">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={isBusy}
            className="mt-1 size-4 shrink-0 accent-primary"
          />
          <span>
            This is my complete ledger snapshot. I understand that entries absent from this
            file will be removed.
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
            Replace ledger with this snapshot
          </Button>
        </div>
      </Card>
    </section>
  )
}
