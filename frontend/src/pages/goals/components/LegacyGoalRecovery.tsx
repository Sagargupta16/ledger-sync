import { useId, useState } from 'react'

import { Button } from '@/components/ui'

import type { GoalRecoveryState } from '../useLegacyGoalRecovery'
import LegacyGoalRecoveryItem from './LegacyGoalRecoveryItem'

export default function LegacyGoalRecovery({
  recovery,
  isEditing,
}: Readonly<{
  recovery: GoalRecoveryState
  isEditing: boolean
}>) {
  const panelId = useId()
  const titleId = useId()
  const [open, setOpen] = useState(false)
  if (!recovery.items.length && !recovery.message && !recovery.error) return null

  return (
    <section aria-labelledby={titleId} className="ledger-panel space-y-3 p-4 sm:p-5">
      <h2 id={titleId} className="text-balance text-base font-semibold">Older goal changes in this browser</h2>
      {recovery.items.length > 0 && (
        <>
          <p className="max-w-prose text-pretty text-sm text-text-secondary">
            An earlier version saved goal changes only in this browser. Review them before saving to your current account.
            Nothing is applied automatically, and the original browser data is kept.
          </p>
          <Button
            variant="secondary"
            aria-expanded={open}
            aria-controls={panelId}
            disabled={recovery.pendingGoalId !== null}
            onClick={() => {
              recovery.refresh()
              setOpen(!open)
            }}
          >
            {open ? 'Close review' : 'Review older goal changes'}
          </Button>
          {isEditing && <p className="text-sm text-text-secondary">Finish editing your goal before recovering older changes.</p>}
          {open && (
            <div id={panelId} className="space-y-4">
              {recovery.items.map((item) => (
                <LegacyGoalRecoveryItem
                  key={item.signature}
                  item={item}
                  recovery={recovery}
                  disabled={isEditing || recovery.pendingGoalId !== null}
                />
              ))}
            </div>
          )}
        </>
      )}
      {recovery.message && (
        <output aria-live="polite" aria-atomic="true" className="block text-sm text-text-secondary">
          {recovery.message}
        </output>
      )}
      {recovery.error && !recovery.items.some((item) => item.goal.id === recovery.error?.goalId) && (
        <p role="alert" className="text-sm text-app-red">{recovery.error.message}</p>
      )}
    </section>
  )
}
