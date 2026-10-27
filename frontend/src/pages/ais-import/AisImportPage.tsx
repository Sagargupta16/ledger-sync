import { AlertTriangle, ArrowLeft, X } from 'lucide-react'
import { Link } from 'react-router'

import { Button, PageContainer, PageHeader, Select, StickyToolbar } from '@/components/ui'
import { ROUTES } from '@/constants'

import { COMPUTATION_NOTE, taxYearLabel } from './aisImportLabels'
import AisDetailSections from './components/AisDetailSections'
import AisReconciliationPanel from './components/AisReconciliationPanel'
import AisTotalsPanel from './components/AisTotalsPanel'
import AisUnlockCard from './components/AisUnlockCard'
import SavedAisYears from './components/SavedAisYears'
import { useAisImport } from './useAisImport'

const taxLink = (
  <Link
    to={ROUTES.TAX_PLANNING}
    className="inline-flex min-h-11 items-center justify-center gap-2 self-start whitespace-nowrap rounded-lg border border-border bg-[var(--overlay-2)] px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-[var(--overlay-5)] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] lg:pointer-fine:min-h-8 lg:pointer-fine:py-1.5"
  >
    <ArrowLeft className="size-4" aria-hidden="true" />
    <span>Income Tax</span>
  </Link>
)

export default function AisImportPage() {
  const model = useAisImport()
  const { statement } = model
  const yearMismatch = statement?.taxYear && statement.taxYear !== model.taxYear ? statement.taxYear : null

  return (
    <PageContainer>
      <PageHeader
        title="AIS import"
        subtitle="Read your Annual Information Statement in this browser: actual TDS, interest and dividends, checked against your ledger."
        action={taxLink}
      />

      {statement && (
        <StickyToolbar label="Statement year" className="flex flex-wrap items-end gap-3">
          <div className="w-full min-w-0 sm:w-72">
            <Select
              label="Tax year"
              value={model.taxYear}
              onChange={(event) => model.setTaxYear(event.target.value)}
              options={model.yearOptions.map((year) => ({ value: year, label: taxYearLabel(year) }))}
            />
          </div>
          <p className="min-w-0 flex-1 truncate pb-2.5 font-mono text-xs text-muted-foreground" title={model.fileLabel ?? undefined}>
            {model.fileLabel}
          </p>
          <Button variant="secondary" icon={<X className="size-4" aria-hidden="true" />} onClick={model.close}>
            Close statement
          </Button>
        </StickyToolbar>
      )}

      {!statement && (
        <AisUnlockCard
          isOpening={model.isOpening}
          error={model.openError}
          isDemoMode={model.isDemoMode}
          yearOptions={model.yearOptions}
          defaultYear={model.defaultYear}
          onOpen={model.open}
          onOpenSample={model.openSample}
        />
      )}

      {statement && (
        <>
          {(yearMismatch || statement.warnings.length > 0) && (
            <ul className="space-y-2 rounded-lg border border-app-orange/30 bg-app-orange/5 p-3 text-sm text-foreground">
              {yearMismatch && (
                <li className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-app-orange" aria-hidden="true" />
                  The statement covers {taxYearLabel(yearMismatch)}; its totals would be saved under {taxYearLabel(model.taxYear)}.
                </li>
              )}
              {statement.warnings.map((warning) => (
                <li key={warning} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-app-orange" aria-hidden="true" />
                  {warning}
                </li>
              ))}
            </ul>
          )}
          <AisTotalsPanel
            summary={statement.summary}
            taxYear={model.taxYear}
            savedForYear={model.savedForYear}
            recognised={statement.recognised}
            isDemoMode={model.isDemoMode}
            isSaving={model.save.isPending}
            onSave={model.saveTotals}
          />
          <AisReconciliationPanel
            reconciliation={model.reconciliation}
            isLoading={model.ledger.isLoading}
            isError={model.ledger.isError}
            onRetry={() => { void model.ledger.refetch() }}
          />
          <AisDetailSections statement={statement} />
        </>
      )}

      <SavedAisYears
        summaries={model.saved.data}
        isLoading={model.saved.isLoading}
        isError={model.saved.isError}
        isDemoMode={model.isDemoMode}
        isRemoving={model.remove.isPending}
        onRemove={model.removeYear}
        onRetry={() => { void model.saved.refetch() }}
      />

      <p className="border-t border-[var(--hairline-1)] pt-4 text-xs leading-5 text-muted-foreground">
        {COMPUTATION_NOTE} The decryption follows the reverse-engineered AIS utility scheme, not a
        documented one, so a portal change can stop a file from opening.
      </p>
    </PageContainer>
  )
}
