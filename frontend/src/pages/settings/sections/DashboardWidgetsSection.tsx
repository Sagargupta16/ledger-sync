/**
 * Dashboard Widgets section - toggle Quick Insight card visibility.
 */

import { LayoutGrid, Check } from 'lucide-react'
import { Section } from '../sectionPrimitives'
import { DASHBOARD_WIDGETS } from '../helpers'

interface Props {
  index: number
  visibleWidgets: string[]
  setVisibleWidgets: (widgets: string[]) => void
}

export default function DashboardWidgetsSection({
  index,
  visibleWidgets,
  setVisibleWidgets,
}: Readonly<Props>) {
  const toggleWidget = (key: string) => {
    const isVisible = visibleWidgets.includes(key)
    const next = isVisible
      ? visibleWidgets.filter((w) => w !== key)
      : [...visibleWidgets, key]
    setVisibleWidgets(next)
    localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(next))
  }

  const showAll = () => {
    const all = DASHBOARD_WIDGETS.map((w) => w.key)
    setVisibleWidgets([...all])
    localStorage.setItem('ledger-sync-visible-widgets', JSON.stringify(all))
  }

  return (
    <Section
      index={index}
      icon={LayoutGrid}
      title="Dashboard Widgets"
      description="Choose which Quick Insight cards appear on your Dashboard"
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
        {DASHBOARD_WIDGETS.map((widget) => {
          const isVisible = visibleWidgets.includes(widget.key)
          return (
            <label
              key={widget.key}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors ${
                isVisible ? 'hover:bg-white/5' : 'opacity-50 hover:opacity-75'
              }`}
            >
              <button
                type="button"
                onClick={() => toggleWidget(widget.key)}
                className={`w-5 h-5 rounded flex items-center justify-center shrink-0 transition-colors ${
                  isVisible
                    ? 'bg-primary/20 text-primary border border-primary/50'
                    : 'bg-white/5 border border-border'
                }`}
              >
                {isVisible && <Check className="w-3 h-3" />}
              </button>
              <span className="text-sm text-white">{widget.label}</span>
            </label>
          )
        })}
      </div>
      <button
        type="button"
        onClick={showAll}
        className="text-xs text-primary hover:underline mt-2"
      >
        Show all widgets
      </button>
    </Section>
  )
}
