import { KeyRound, Sparkles, Trash2 } from 'lucide-react'
import { AnimatePresence } from 'motion/react'

import EmptyState from '@/components/shared/EmptyState'
import { Button, PageContainer, PageHeader } from '@/components/ui'
import { ROUTES } from '@/constants'

import CanvasChartCard from './components/CanvasChartCard'
import CanvasChatPane from './components/CanvasChatPane'
import CanvasEmpty from './components/CanvasEmpty'
import { useAiCanvas } from './useAiCanvas'

/**
 * AI Canvas: ask for a chart in plain words and the assistant fetches the
 * numbers with the read-only data tools, then draws them with the chart kit.
 * Phone to lg: composer first, charts under it (two across from lg). xl: charts
 * on the left, the chat pinned in a 22rem column on the right, which is the
 * first width where that column leaves the charts room.
 */
export default function AiCanvasPage() {
  const canvas = useAiCanvas()
  const hasCharts = canvas.charts.length > 0

  return (
    <PageContainer>
      <PageHeader
        title="AI Canvas"
        subtitle="Describe a chart of your data and the assistant draws it from your real numbers."
        action={
          hasCharts ? (
            <Button type="button" variant="secondary" size="sm" onClick={canvas.clearCanvas}>
              <Trash2 className="size-3.5" aria-hidden="true" />
              Clear canvas
            </Button>
          ) : undefined
        }
      />

      {canvas.availability === 'demo' && (
        <EmptyState
          icon={Sparkles}
          title="AI Canvas needs a signed-in account"
          description="The assistant is off in demo mode. Sign in to chart your own data."
          variant="card"
        />
      )}
      {canvas.availability === 'needs-key' && (
        <EmptyState
          icon={KeyRound}
          title="Add your AI key first"
          description="Your AI Assistant is set to your own key, and none is saved yet. Add one in Settings > AI Assistant, or switch to the app's shared model."
          actionLabel="Open Settings"
          actionHref={ROUTES.SETTINGS}
          variant="card"
        />
      )}

      {canvas.availability === 'ready' && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
          <div className="xl:sticky xl:top-4 xl:order-2">
            <CanvasChatPane
              messages={canvas.messages}
              isStreaming={canvas.isStreaming}
              error={canvas.error}
              onSend={canvas.ask}
              onStop={canvas.stop}
              onClear={canvas.clearChat}
            />
          </div>
          <section aria-label="Charts" className="min-w-0 xl:order-1">
            {hasCharts ? (
              <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <AnimatePresence initial={false}>
                  {canvas.charts.map((chart) => (
                    <CanvasChartCard key={chart.id} chart={chart} onRemove={canvas.removeChart} />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <CanvasEmpty onPick={canvas.ask} disabled={canvas.isStreaming} />
            )}
          </section>
        </div>
      )}
    </PageContainer>
  )
}
