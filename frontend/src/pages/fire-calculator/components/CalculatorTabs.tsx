import type { KeyboardEvent } from 'react'
import { Calculator, Dices, Flame, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui'

export type CalculatorTab = 'fire' | 'retirement' | 'montecarlo'

const TABS: ReadonlyArray<{ readonly id: CalculatorTab; readonly label: string; readonly icon: LucideIcon }> = [
  { id: 'fire', label: 'FIRE', icon: Flame },
  { id: 'retirement', label: 'Retirement', icon: Calculator },
  { id: 'montecarlo', label: 'Monte Carlo', icon: Dices },
]

/** Arrow keys step through the tabs (wrapping), Home and End jump to the ends. */
function tabForKey(key: string, active: CalculatorTab): CalculatorTab | null {
  const index = TABS.findIndex((tab) => tab.id === active)
  if (key === 'ArrowRight') return TABS[(index + 1) % TABS.length].id
  if (key === 'ArrowLeft') return TABS[(index - 1 + TABS.length) % TABS.length].id
  if (key === 'Home') return TABS[0].id
  if (key === 'End') return TABS[TABS.length - 1].id
  return null
}

interface CalculatorTabsProps {
  readonly active: CalculatorTab
  readonly onChange: (tab: CalculatorTab) => void
}

/** The calculator mode tablist: deterministic FIRE, retirement corpus, and the Monte Carlo run. */
export default function CalculatorTabs({ active, onChange }: CalculatorTabsProps) {
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const next = tabForKey(event.key, active)
    if (!next) return
    event.preventDefault()
    onChange(next)
    requestAnimationFrame(() => document.getElementById(`${next}-tab`)?.focus())
  }

  // Full width on a phone, each tab growing from its label. Icons show from sm
  // up: without them the three labels fit one line on a 320px screen, and the
  // row wraps rather than squeezing a label if they ever do not.
  return (
    <div className="flex w-full flex-wrap gap-1 rounded-lg bg-muted/20 p-1 sm:w-auto" role="tablist" aria-label="Calculator mode">
      {TABS.map(({ id, label, icon: Icon }) => (
        <Button
          key={id}
          type="button"
          role="tab"
          id={`${id}-tab`}
          aria-selected={active === id}
          aria-controls={`${id}-panel`}
          tabIndex={active === id ? 0 : -1}
          onClick={() => onChange(id)}
          onKeyDown={onKeyDown}
          variant={active === id ? 'secondary' : 'ghost'}
          size="sm"
          className="flex-auto whitespace-nowrap px-3 sm:flex-none sm:px-4"
        >
          <Icon className="hidden size-4 shrink-0 sm:block" aria-hidden="true" />
          {label}
        </Button>
      ))}
    </div>
  )
}
