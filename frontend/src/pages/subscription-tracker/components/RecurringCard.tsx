import { useState } from 'react'
import {
  Trash2,
  Pencil,
  Power,
  PowerOff,
  RefreshCw,
  Calendar,
  CheckCircle2,
  Receipt,
  ShoppingBag,
} from 'lucide-react'

import { Button } from '@/components/ui'
import { getRecurringFreshness } from '@/lib/recurringCalculations'
import type { RecurringTransaction } from '@/hooks/api/useAnalyticsV2'

import { formatDate } from '../helpers'
import { RecurringAmount } from './RecurringAmount'
import { RecurringBadges } from './RecurringBadges'
import { RecurringEditForm } from './RecurringEditForm'

interface RecurringCardPatch {
  pattern_name?: string
  frequency?: string
  expected_amount?: number
  is_active?: boolean
  is_confirmed?: boolean
  pattern_kind?: string
}

export function RecurringCard({
  item,
  asOfDateKey,
  onUpdate,
  onDelete,
}: Readonly<{
  item: RecurringTransaction
  asOfDateKey: string
  onUpdate: (patch: RecurringCardPatch) => void
  onDelete: () => void
}>) {
  const [editing, setEditing] = useState(false)

  const isIncome = item.type === 'Income'
  const isHabit = item.pattern_kind === 'habit'
  const freshness = getRecurringFreshness(item, asOfDateKey)

  if (editing) {
    return (
      <RecurringEditForm
        item={item}
        onSave={(patch) => {
          onUpdate(patch)
          setEditing(false)
        }}
        onCancel={() => setEditing(false)}
      />
    )
  }

  return (
    <div className={`ledger-panel p-4 ${
      item.is_active ? '' : 'border-[var(--hairline-1)] opacity-70'
    }`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:items-center">
          <div className={`h-8 w-2 shrink-0 rounded-full ${isIncome ? 'bg-app-green' : 'bg-app-red'}`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-medium text-foreground truncate" title={item.name}>
                {item.name}
              </h3>
              <RecurringBadges item={item} needsReview={freshness === 'needs-review'} />
            </div>
            {freshness === 'needs-review' && (
              <p className="mt-2 text-xs text-muted-foreground">
                No recent matching entry. Review whether this still recurs.
              </p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-tertiary">
              {item.category && <span>{item.category}</span>}
              {item.last_occurrence && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> Last: {formatDate(item.last_occurrence)}
                </span>
              )}
              {item.next_expected && (
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3" /> Next: {formatDate(item.next_expected)}
                </span>
              )}
            </div>
          </div>
        </div>
        <div className="flex w-full shrink-0 flex-wrap items-center justify-between gap-3 sm:w-auto sm:justify-end">
          <RecurringAmount item={item} />
          <div className="flex w-full items-center justify-between gap-0.5 sm:w-auto sm:justify-start">
            {!item.is_confirmed && !isHabit && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                icon={<CheckCircle2 className="h-3.5 w-3.5" />}
                onClick={() => onUpdate({ is_confirmed: true })}
                title="Confirm this is a real commitment"
                aria-label="Confirm recurring item"
                className="text-app-green hover:bg-app-green/10"
              />
            )}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={
                isHabit
                  ? <Receipt className="h-3.5 w-3.5" />
                  : <ShoppingBag className="h-3.5 w-3.5" />
              }
              onClick={() =>
                onUpdate({
                  pattern_kind: isHabit ? 'commitment' : 'habit',
                  // Reclassifying is a deliberate judgement, so it counts as
                  // confirming: the detector must not overwrite it next refresh.
                  is_confirmed: true,
                })
              }
              title={isHabit ? 'Treat as a bill (count in fixed costs)' : 'Not a bill (exclude from fixed costs)'}
              aria-label={isHabit ? 'Treat as a bill' : 'Mark as not a bill'}
              className="text-text-tertiary hover:text-foreground"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Pencil className="h-3.5 w-3.5" />}
              onClick={() => setEditing(true)}
              title="Edit"
              aria-label="Edit recurring item"
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={
                item.is_active
                  ? <Power className="h-3.5 w-3.5" />
                  : <PowerOff className="h-3.5 w-3.5" />
              }
              onClick={() => onUpdate({ is_active: !item.is_active })}
              title={item.is_active ? 'Deactivate' : 'Activate'}
              aria-label={item.is_active ? 'Pause recurring item' : 'Activate recurring item'}
              className={item.is_active ? 'text-app-green hover:bg-app-green/10' : undefined}
            />
            <Button
              type="button"
              variant="ghost"
              size="sm"
              icon={<Trash2 className="h-3.5 w-3.5" />}
              onClick={onDelete}
              title="Delete"
              aria-label="Delete recurring item"
              className="text-text-tertiary hover:bg-app-red/10 hover:text-app-red"
            />
          </div>
        </div>
      </div>
    </div>
  )
}
