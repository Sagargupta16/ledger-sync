import { useState } from 'react'

import { BadgeIndianRupee, Landmark, PiggyBank, Receipt, Save } from 'lucide-react'

import MetricCard from '@/components/shared/MetricCard'
import { Button, ConfirmDialog, Money } from '@/components/ui'
import { formatCurrency, formatDate } from '@/lib/formatters'
import type { AisSummary } from '@/lib/tax/aisSummary'
import type { TaxAisSummary } from '@/services/api/taxAis'

import { taxYearLabel } from '../aisImportLabels'

interface Props {
  readonly summary: AisSummary
  readonly taxYear: string
  readonly savedForYear: TaxAisSummary | null
  /** False when no TDS, SFT or salary line was read, so the totals are zeros of an unknown layout. */
  readonly recognised: boolean
  readonly isDemoMode: boolean
  readonly isSaving: boolean
  readonly onSave: () => void
}

const isAllZero = (totals: Readonly<Record<'tds_salary' | 'tds_other' | 'interest' | 'dividends', number>>) =>
  totals.tds_salary === 0 && totals.tds_other === 0 && totals.interest === 0 && totals.dividends === 0

const replaceNote = (taxYear: string, saved: TaxAisSummary) =>
  `Every total in this statement is zero, but ${taxYearLabel(taxYear)} has totals saved on ${formatDate(new Date(saved.updated_at))}: TDS on salary ${formatCurrency(saved.tds_salary)}, other TDS ${formatCurrency(saved.tds_other)}, interest ${formatCurrency(saved.interest)}, dividends ${formatCurrency(saved.dividends)}. Saving replaces them with zeros.`

export default function AisTotalsPanel({ summary, taxYear, savedForYear, recognised, isDemoMode, isSaving, onSave }: Props) {
  const [confirming, setConfirming] = useState(false)
  const { reported } = summary
  // Saving replaces the year, so zeros must not silently overwrite figures a real import saved.
  const wipesSaved = savedForYear !== null && !isAllZero(savedForYear) && isAllZero({
    tds_salary: summary.tdsSalary, tds_other: summary.tdsOther, interest: summary.interest, dividends: summary.dividends,
  })
  return (
    <section aria-labelledby="ais-totals-title" className="space-y-4">
      <div>
        <h2 id="ais-totals-title" className="text-base font-semibold">Totals for {taxYearLabel(taxYear)}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Interest and dividends count each payer once: the larger of its SFT report and its TDS
          lines, which undercounts when the two cover different accounts (both figures show under
          each total). A computation aid, not tax advice.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard title="TDS on salary" value={formatCurrency(summary.tdsSalary)} icon={Receipt} color="blue" subtitle="Section 192" />
        <MetricCard title="Other TDS" value={formatCurrency(summary.tdsOther)} icon={Landmark} color="purple" subtitle="All other sections, TCS excluded" />
        <MetricCard
          title="Interest"
          value={formatCurrency(summary.interest)}
          icon={PiggyBank}
          color="green"
          subtitle={`SFT ${formatCurrency(reported.interestSft)}, TDS lines ${formatCurrency(reported.interestTds)}`}
        />
        <MetricCard
          title="Dividends"
          value={formatCurrency(summary.dividends)}
          icon={BadgeIndianRupee}
          color="teal"
          subtitle={`SFT ${formatCurrency(reported.dividendsSft)}, TDS lines ${formatCurrency(reported.dividendsTds)}`}
        />
      </div>
      {summary.tcs > 0 && (
        <p className="text-xs leading-5 text-muted-foreground">
          TCS collected: <Money value={summary.tcs} />. It is a separate credit and is not saved.
        </p>
      )}
      <div className="ledger-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-muted-foreground">
          Saving sends only these four totals for {taxYearLabel(taxYear)}, so /tax can show the TDS on
          salary as actual payroll TDS.
          {recognised && savedForYear && ` It replaces the totals saved on ${formatDate(new Date(savedForYear.updated_at))}.`}
          {!recognised && ' Nothing in this file was recognised, so there is nothing to save.'}
          {isDemoMode && ' Demo mode saves nothing; sign up to keep your own totals.'}
        </p>
        <Button
          className="shrink-0"
          icon={<Save className="size-4" aria-hidden="true" />}
          isLoading={isSaving}
          disabled={isDemoMode || !recognised}
          onClick={() => (wipesSaved ? setConfirming(true) : onSave())}
        >
          Save totals
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Replace the saved totals with zeros?"
        description={savedForYear ? replaceNote(taxYear, savedForYear) : ''}
        confirmLabel="Replace with zeros"
        variant="warning"
        onConfirm={onSave}
      />
    </section>
  )
}
