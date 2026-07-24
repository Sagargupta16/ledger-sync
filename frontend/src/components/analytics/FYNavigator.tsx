import { motion } from 'framer-motion'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatCurrency } from '@/lib/formatters'
import { Button } from '@/components/ui'

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
      className="glass rounded-2xl border border-border p-6"
    >
      <div className="flex items-center justify-between gap-2">
        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onGoBack}
          disabled={!canGoBack}
          aria-label="Previous fiscal year"
          className="shrink-0 rounded-xl p-3 disabled:opacity-30"
        >
          <ChevronLeft className="size-5" aria-hidden="true" />
        </Button>

        <div className="text-center flex-1 min-w-0">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-foreground">{selectedFY || 'Select FY'}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isNewRegime
                  ? 'New Tax Regime (2025-26 onwards)'
                  : 'Old Tax Regime (Before 2025-26)'}
              </p>
            </div>

            {/* Projection Toggle - only for current FY */}
            {isCurrentFY && hasEmploymentIncome && (
              <div className="flex flex-col items-start gap-1">
                <Button
                  type="button"
                  variant={showProjection ? 'primary' : 'secondary'}
                  size="sm"
                  onClick={onToggleProjection}
                  aria-pressed={showProjection}
                  className="whitespace-nowrap"
                >
                  {showProjection ? 'Showing Projection' : 'Show Year-End Projection'}
                </Button>
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

        <Button
          type="button"
          variant="secondary"
          size="lg"
          onClick={onGoForward}
          disabled={!canGoForward}
          aria-label="Next fiscal year"
          className="shrink-0 rounded-xl p-3 disabled:opacity-30"
        >
          <ChevronRight className="size-5" aria-hidden="true" />
        </Button>
      </div>
    </motion.div>
  )
}
