import { KeyRound, Sparkles, Trash2 } from 'lucide-react'
import { AnimatePresence } from 'motion/react'

import EmptyState from '@/components/shared/EmptyState'
import { Button, PageContainer, PageHeader } from '@/components/ui'
import { ROUTES } from '@/constants'

import CanvasChartCard from './components/CanvasChartCard'
import CanvasChatPane from './components/CanvasChatPane'
import CanvasEmpty from './components/CanvasEmpty'
import GeneratingCard from './components/GeneratingCard'
import { useAiCanvas } from './useAiCanvas'

/**
 * AI Canvas: ask for a chart in plain words and the assistant fetches the
 * numbers with the read-only data tools, then draws them with the chart kit.
 * Phone to lg: the chat (composer first), then the canvas. xl: the chat in a
 * full-height 24rem column on the left, composer at its foot, as a chat beside
 * its work; the canvas fills the rest. The newest chart (or the one being drawn)
 * spans the canvas; older ones fill an auto-fit grid, so no row is half empty.
 */
export default function AiCanvasPage() {
  const canvas = useAiCanvas()
  const hasCharts = canvas.charts.length > 0
  const generating = canvas.isStreaming && canvas.startedAt !== null
  let status = ''
  if (generating) status = 'Drawing your chart'
  else if (hasCharts) status = `${canvas.charts.length} ${canvas.charts.length === 1 ? 'chart' : 'charts'} on the canvas`

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
        <div className="grid gap-4 xl:grid-cols-[24rem_minmax(0,1fr)] xl:items-start xl:gap-6">
          {/* 15rem is the app header, the page header and the page padding above and below. */}
          <div className="min-w-0 xl:sticky xl:top-4 xl:h-[calc(100dvh-15rem)] xl:min-h-[28rem]">
            <CanvasChatPane
              messages={canvas.messages}
              isStreaming={canvas.isStreaming}
              error={canvas.error}
              onSend={canvas.ask}
              onRetry={canvas.retry}
              onStop={canvas.stop}
              onClear={canvas.clearChat}
            />
          </div>
          <section aria-label="Charts" className="min-w-0">
            {/* Rendered even when empty, so a screen reader hears the start and the end of a run. */}
            <p className="sr-only" role="status">
              {status}
            </p>
            {hasCharts || generating ? (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,26rem),1fr))] gap-4 [&>*:first-child]:col-span-full">
                <AnimatePresence initial={false}>
                  {generating && canvas.startedAt !== null && (
                    <GeneratingCard
                      key="generating"
                      steps={canvas.steps}
                      startedAt={canvas.startedAt}
                      onStop={canvas.stop}
                    />
                  )}
                  {canvas.charts.map((chart) => (
                    <CanvasChartCard
                      key={chart.id}
                      chart={chart}
                      onRemove={canvas.removeChart}
                      onAsk={canvas.ask}
                      busy={canvas.isStreaming}
                    />
                  ))}
                </AnimatePresence>
              </div>
            ) : (
              <div className="xl:h-[calc(100dvh-15rem)] xl:min-h-[28rem]">
                <CanvasEmpty onPick={canvas.ask} disabled={canvas.isStreaming} />
              </div>
            )}
          </section>
        </div>
      )}
    </PageContainer>
  )
}
