import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui'

interface Props {
  isNewRegime: boolean
  setRegimeOverride: (regime: 'new' | 'old') => void
  newRegimeAvailable: boolean
  isCurrentFY: boolean
  showProjection: boolean
  setShowProjection: (show: boolean) => void
  selectedFY: string
  canGoBack: boolean
  canGoForward: boolean
  goToPreviousFY: () => void
  goToNextFY: () => void
  hasSalaryData: boolean
}

export default function TaxPageActions({
  isNewRegime,
  setRegimeOverride,
  newRegimeAvailable,
  isCurrentFY,
  showProjection,
  setShowProjection,
  selectedFY,
  canGoBack,
  canGoForward,
  goToPreviousFY,
  goToNextFY,
  hasSalaryData,
}: Readonly<Props>) {
  return (
    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      {newRegimeAvailable && (
        <div
          className="grid grid-cols-2 overflow-hidden rounded-lg border border-border"
          role="group"
          aria-label="Tax regime"
        >
          <Button
            type="button"
            onClick={() => setRegimeOverride('new')}
            variant={isNewRegime ? 'primary' : 'ghost'}
            size="sm"
            aria-pressed={isNewRegime}
            className="rounded-none border-0 px-3"
          >
            New Regime
          </Button>
          <Button
            type="button"
            onClick={() => setRegimeOverride('old')}
            variant={isNewRegime ? 'ghost' : 'primary'}
            size="sm"
            aria-pressed={!isNewRegime}
            className="rounded-none border-0 px-3"
          >
            Old Regime
          </Button>
        </div>
      )}

      {isCurrentFY && hasSalaryData && (
        <Button
          type="button"
          onClick={() => setShowProjection(!showProjection)}
          variant={showProjection ? 'primary' : 'secondary'}
          size="sm"
          aria-pressed={showProjection}
          className="w-full sm:w-auto"
        >
          {showProjection ? 'Showing Projection' : 'Project from Salary'}
        </Button>
      )}

      <div
        className="flex min-w-0 items-center justify-between gap-2 sm:justify-start"
        role="group"
        aria-label="Fiscal year"
      >
        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<ChevronLeft className="w-4 h-4" />}
          onClick={goToPreviousFY}
          disabled={!canGoBack}
          aria-label="Previous FY"
          className="px-2"
        />

        <span className="min-w-0 flex-1 text-center font-medium text-foreground sm:min-w-28 sm:flex-none">
          {selectedFY || 'Select FY'}
        </span>

        <Button
          type="button"
          variant="secondary"
          size="sm"
          icon={<ChevronRight className="w-4 h-4" />}
          onClick={goToNextFY}
          disabled={!canGoForward}
          aria-label="Next FY"
          className="px-2"
        />
      </div>
    </div>
  )
}
