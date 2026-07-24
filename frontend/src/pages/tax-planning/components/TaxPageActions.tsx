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
    <div className="flex items-center gap-4 flex-wrap">
      {newRegimeAvailable && (
        <div className="flex rounded-lg border border-border overflow-hidden">
          <Button
            type="button"
            onClick={() => setRegimeOverride('new')}
            variant={isNewRegime ? 'primary' : 'ghost'}
            size="sm"
            className="rounded-none border-0"
          >
            New Regime
          </Button>
          <Button
            type="button"
            onClick={() => setRegimeOverride('old')}
            variant={isNewRegime ? 'ghost' : 'primary'}
            size="sm"
            className="rounded-none border-0"
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
        >
          {showProjection ? 'Showing Projection' : 'Project from Salary'}
        </Button>
      )}

      <div className="flex items-center gap-2">
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

        <span className="text-foreground font-medium min-w-28 text-center">
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
