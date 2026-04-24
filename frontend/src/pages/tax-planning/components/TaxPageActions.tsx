import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'

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
          <button
            type="button"
            onClick={() => setRegimeOverride('new')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              isNewRegime
                ? 'bg-primary text-white'
                : 'bg-white/5 text-muted-foreground hover:bg-white/10'
            }`}
          >
            New Regime
          </button>
          <button
            type="button"
            onClick={() => setRegimeOverride('old')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${
              isNewRegime
                ? 'bg-white/5 text-muted-foreground hover:bg-white/10'
                : 'bg-primary text-white'
            }`}
          >
            Old Regime
          </button>
        </div>
      )}

      {isCurrentFY && hasSalaryData && (
        <button
          onClick={() => setShowProjection(!showProjection)}
          type="button"
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
            showProjection
              ? 'bg-primary text-white shadow-lg shadow-primary/50'
              : 'bg-white/5 text-muted-foreground hover:bg-white/10 border border-border'
          }`}
        >
          {showProjection ? 'Showing Projection' : 'Project from Salary'}
        </button>
      )}

      <div className="flex items-center gap-2">
        <motion.button
          onClick={goToPreviousFY}
          disabled={!canGoBack}
          className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          whileTap={canGoBack ? { scale: 0.95 } : undefined}
          aria-label="Previous FY"
        >
          <ChevronLeft className="w-4 h-4" />
        </motion.button>

        <span className="text-white font-medium min-w-28 text-center">
          {selectedFY || 'Select FY'}
        </span>

        <motion.button
          onClick={goToNextFY}
          disabled={!canGoForward}
          className="p-2 rounded-lg glass-thin hover:bg-white/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent"
          whileTap={canGoForward ? { scale: 0.95 } : undefined}
          aria-label="Next FY"
        >
          <ChevronRight className="w-4 h-4" />
        </motion.button>
      </div>
    </div>
  )
}
