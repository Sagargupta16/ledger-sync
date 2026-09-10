import { useId, useState } from 'react'

import { Button } from '@/components/ui'
import { formatCurrency } from '@/lib/formatters'

import type { LegacyGoalRecovery, RecoveryChange, RecoveryField } from '../legacyGoalRecovery'
import type { GoalRecoveryState } from '../useLegacyGoalRecovery'
import DeleteGoalDialog from './DeleteGoalDialog'

const FIELD_LABELS: Record<RecoveryField, string> = {
  current_amount: 'Allocated amount',
  name: 'Goal name',
  target_amount: 'Target amount',
  target_date: 'Target date',
}

function displayValue(value: RecoveryChange['value']): string {
  if (typeof value === 'number') return formatCurrency(value)
  return value ?? 'No deadline'
}

export default function LegacyGoalRecoveryItem({
  item,
  recovery,
  disabled,
}: Readonly<{
  item: LegacyGoalRecovery
  recovery: GoalRecoveryState
  disabled: boolean
}>) {
  const titleId = useId()
  const [selected, setSelected] = useState<RecoveryField[]>([])
  const [confirmedOwner, setConfirmedOwner] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const isPending = recovery.pendingGoalId === item.goal.id
  const error = recovery.error?.goalId === item.goal.id ? recovery.error.message : null
  const changes = item.changes.filter((change) => selected.includes(change.field))
  // The legacy demo used these same IDs and had no ownership marker in storage.
  const overlapsDemo = item.goal.id >= 1 && item.goal.id <= 4

  return (
    <section aria-labelledby={titleId} aria-busy={isPending} className="space-y-3 border-t border-border pt-4">
      <h3 id={titleId} className="break-words text-base font-semibold text-foreground">{item.goal.name}</h3>
      {overlapsDemo && (
        <p className="text-sm text-text-secondary">
          The demo also used this goal ID. These values may be demo edits; only confirm changes you recognize as your own.
        </p>
      )}
      <fieldset disabled={disabled} className="space-y-2">
        <legend className="sr-only">Select changes to recover for {item.goal.name}</legend>
        {item.changes.map((change) => (
          <label key={change.field} className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
            <input
              type="checkbox"
              className="mt-1 size-4 shrink-0 accent-primary"
              checked={selected.includes(change.field)}
              onChange={(event) => setSelected((fields) => event.target.checked
                ? [...fields, change.field]
                : fields.filter((field) => field !== change.field))}
              aria-label={`Recover ${FIELD_LABELS[change.field].toLowerCase()} for ${item.goal.name}`}
            />
            <span className="min-w-0 flex-1">
              <span className="text-sm font-medium">{FIELD_LABELS[change.field]}</span>
              <span className="mt-1 grid gap-2 text-sm sm:grid-cols-2">
                <span className="min-w-0 break-words">
                  <span className="block text-xs text-text-tertiary">Current account</span>
                  <span className="tabular-nums">{displayValue(change.current)}</span>
                </span>
                <span className="min-w-0 break-words">
                  <span className="block text-xs text-text-tertiary">Saved in this browser</span>
                  <span className="tabular-nums">{displayValue(change.value)}</span>
                </span>
              </span>
            </span>
          </label>
        ))}
        {item.hidden && (
          <p className="text-sm text-text-secondary">
            This goal was previously hidden in this browser. It is currently visible in your account.
            Deleting it now permanently removes the goal and its saved allocation.
          </p>
        )}
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            className="size-4 shrink-0 accent-primary"
            checked={confirmedOwner}
            onChange={(event) => setConfirmedOwner(event.target.checked)}
          />
          <span>I confirm these are my changes for this goal, not demo edits.</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {item.changes.length > 0 && (
            <Button
              disabled={!confirmedOwner || !changes.length}
              isLoading={isPending}
              onClick={() => { void recovery.save(item, changes) }}
            >
              Save selected changes
            </Button>
          )}
          <Button variant="secondary" onClick={() => { void recovery.keep(item) }}>
            {item.changes.length ? 'Keep current values' : 'Keep goal visible'}
          </Button>
          {item.hidden && (
            <Button variant="ghost" disabled={!confirmedOwner} onClick={() => setConfirmDelete(true)}>
              Review deletion
            </Button>
          )}
        </div>
      </fieldset>
      {error && <p role="alert" className="text-sm text-app-red">{error}</p>}
      <DeleteGoalDialog
        open={confirmDelete}
        goalName={item.goal.name}
        isPending={isPending}
        isDemoMode={false}
        error={error}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => recovery.remove(item)}
      />
    </section>
  )
}
