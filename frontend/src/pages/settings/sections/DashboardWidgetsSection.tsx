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
           const controlId = `dashboard-widget-${widget.key}`
           return (
             <label
               key={widget.key}
               htmlFor={controlId}
               className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${
                 isVisible ? 'hover:bg-[var(--overlay-2)]' : 'opacity-50 hover:opacity-75'
               }`}
             >
               <input
                 id={controlId}
                 type="checkbox"
                 checked={isVisible}
                 onChange={() => toggleWidget(widget.key)}
                 className="sr-only"
               />
               <span
                 aria-hidden="true"
                 className={`flex size-5 shrink-0 items-center justify-center rounded transition-colors ${
                   isVisible
                     ? 'bg-primary/20 text-primary border border-primary/50'
                     : 'bg-[var(--overlay-2)] border border-border'
                 }`}
               >
                 {isVisible && <Check className="w-3 h-3" />}
               </span>
               <span className="text-sm text-foreground">{widget.label}</span>
             </label>
          )
        })}
      </div>
       <button
         id="show-all-dashboard-widgets"
         type="button"
         onClick={showAll}
         className="mt-2 min-h-11 rounded-md px-2 text-xs text-primary hover:underline sm:min-h-10"
      >
        Show all widgets
      </button>
    </Section>
  )
}
