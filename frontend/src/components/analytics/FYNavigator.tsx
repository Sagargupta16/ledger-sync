import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'

interface FYNavigatorProps {
  selectedFY: string
  isNewRegime: boolean
  isCurrentFY: boolean
  hasEmploymentIncome: boolean
  showProjection: boolean
  onToggleProjection: () => void
  remainingMonths: number
  avgMonthlySalary: number
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
}

export default function FYNavigator({
  selectedFY,
  isNewRegime,
  isCurrentFY,
  hasEmploymentIncome,
  showProjection,
  onToggleProjection,
  remainingMonths,
  avgMonthlySalary,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
}: Readonly<FYNavigatorProps>) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl border border-border p-6 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <button
          onClick={onGoBack}
          disabled={!canGoBack}
          className="p-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-border"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="text-center flex-1">
          <div className="flex items-center justify-center gap-4">
            <div>
              <h2 className="text-3xl font-bold text-white">{selectedFY || 'Select FY'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isNewRegime
                  ? 'New Tax Regime (2025-26 onwards)'
                  : 'Old Tax Regime (Before 2025-26)'}
              </p>
            </div>

            {/* Projection Toggle - only for current FY */}
            {isCurrentFY && hasEmploymentIncome && (
              <div className="flex flex-col items-start gap-1">
                <button
                  onClick={onToggleProjection}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                    showProjection
                      ? 'bg-primary text-white shadow-lg shadow-primary/50'
                      : 'bg-white/5 text-muted-foreground hover:bg-white/10'
                  }`}
                >
                  {showProjection ? 'Showing Projection' : 'Show Year-End Projection'}
                </button>
                {showProjection && remainingMonths > 0 && (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Projecting {remainingMonths} more{' '}
                    {remainingMonths === 1 ? 'month' : 'months'} @{' '}
                    {formatCurrency(avgMonthlySalary)}/month (avg 3mo)
                  </span>
                )}
              </div>
            )}
          </div>
        </div>

        <button
          onClick={onGoForward}
          disabled={!canGoForward}
          className="p-3 rounded-xl bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-colors border border-border"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </motion.div>
  )
}
