import { useEffect, useRef } from 'react'

import { motion } from 'motion/react'
import { Pause, Pencil, Play, Trash2 } from 'lucide-react'

import ProgressBar from '@/components/shared/ProgressBar'
import { Button, Money } from '@/components/ui'
import { DURATION, fadeUpItem } from '@/constants/animations'
import { formatPercent } from '@/lib/formatters'
import type { Budget } from '@/services/api/analyticsV2'
import type { UpdateBudgetRequest } from '@/services/api/analyticsV2Planning'

import { STATUS_STYLE, budgetLabel, budgetStatus, formatThreshold, statusLabel } from '../categoryBudgetUtils'
import BudgetEditForm from './BudgetEditForm'

interface Props {
  readonly budget: Budget
  readonly isEditing: boolean
  /** This row's editor save is in flight. */
  readonly isSaving: boolean
  /** This row's pause or resume is in flight. */
  readonly isToggling: boolean
  /** Some budget request is in flight, so every row's actions wait. */
  readonly isLocked: boolean
  readonly editError: string | null
  readonly onEdit: () => void
  readonly onCancel: () => void
  readonly onSave: (patch: UpdateBudgetRequest) => void
  readonly onToggleActive: () => void
  readonly onDelete: () => void
}

const ICON_BUTTON = 'size-11 p-0 lg:pointer-fine:size-9'
const FIGURES_CELL = 'col-span-2 row-start-2 min-w-0 md:col-span-1 md:col-start-2 md:row-start-1'

/**
 * One category budget: this month's spend against its limit, with the alert
 * threshold as the tick on the bar, and edit / pause or resume / delete.
 * Stacks on phones; a three-column row from `md` up.
 */
export function BudgetRow({
  budget,
  isEditing,
  isSaving,
  isToggling,
  isLocked,
  editError,
  onEdit,
  onCancel,
  onSave,
  onToggleActive,
  onDelete,
}: Props) {
  const editRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(isEditing)
  const label = budgetLabel(budget)
  const status = budgetStatus(budget)
  const style = STATUS_STYLE[status]
  const paused = status === 'paused'

  // Closing the editor unmounts the focused field; hand focus back to Edit.
  useEffect(() => {
    if (wasEditing.current && !isEditing) editRef.current?.focus()
    wasEditing.current = isEditing
  }, [isEditing])

  return (
    <motion.li
      layout="position"
      variants={fadeUpItem}
      exit={{ opacity: 0, transition: { duration: DURATION.quick } }}
      className="px-4 py-3.5 sm:px-5"
    >
      {/* Phones: name and actions share the top line, the bar runs full width
          under them. From md: name | bar | actions on one line. DOM order
          stays name, figures, actions for screen readers. */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2.5 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] md:items-center md:gap-x-5">
        <div className="col-start-1 row-start-1 min-w-0">
          <p className="break-words text-sm font-medium leading-5 text-foreground">{label}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs leading-5">
            <span className={`inline-flex items-center gap-1.5 font-medium ${style.textClass}`}>
              <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
              {statusLabel(budget)}
            </span>
            <span className="text-text-tertiary">Alert at {formatThreshold(budget.alert_threshold)}</span>
          </p>
        </div>

        {paused ? (
          <p className={`${FIGURES_CELL} text-xs leading-5 text-muted-foreground`}>
            Limit <Money value={budget.monthly_limit} muted />. Not tracked and no alerts while paused.
          </p>
        ) : (
          <div className={FIGURES_CELL}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs leading-5">
              <span className="min-w-0 text-muted-foreground">
                <Money value={budget.current_spent} /> of <Money value={budget.monthly_limit} muted />
              </span>
              <span className={`shrink-0 font-mono font-medium tabular-nums ${style.textClass}`}>
                {formatPercent(budget.usage_pct)}
              </span>
            </div>
            <ProgressBar
              value={budget.usage_pct}
              target={budget.alert_threshold}
              color={style.barColor}
              height={6}
              ariaLabel={`${label}: ${formatPercent(budget.usage_pct)} of the monthly limit used`}
            />
            <p className="mt-1.5 text-xs leading-5 text-text-tertiary">
              {budget.remaining < 0 ? (
                <>Over by <Money value={-budget.remaining} className="text-app-red" /></>
              ) : (
                <><Money value={budget.remaining} muted /> left this month</>
              )}
            </p>
          </div>
        )}

        <div className="col-start-2 row-start-1 -mr-2 -mt-1.5 flex items-center justify-end gap-0.5 md:col-start-3 md:mr-0 md:mt-0 md:gap-1">
          <Button
            ref={editRef}
            variant={isEditing ? 'secondary' : 'ghost'}
            size="sm"
            className={ICON_BUTTON}
            icon={<Pencil className="size-4" />}
            title="Edit limit and alert"
            aria-label={`Edit the ${label} budget`}
            aria-expanded={isEditing}
            disabled={isLocked}
            onClick={isEditing ? onCancel : onEdit}
          />
          <Button
            variant="ghost"
            size="sm"
            className={ICON_BUTTON}
            icon={paused ? <Play className="size-4" /> : <Pause className="size-4" />}
            title={paused ? 'Resume budget' : 'Pause budget'}
            aria-label={`${paused ? 'Resume' : 'Pause'} the ${label} budget`}
            isLoading={isToggling}
            disabled={isLocked}
            onClick={onToggleActive}
          />
          <Button
            variant="ghost"
            size="sm"
            className={`${ICON_BUTTON} text-text-tertiary hover:bg-app-red/10 hover:text-app-red`}
            icon={<Trash2 className="size-4" />}
            title="Delete budget"
            aria-label={`Delete the ${label} budget`}
            disabled={isLocked}
            onClick={onDelete}
          />
        </div>
      </div>

      {isEditing && (
        <BudgetEditForm
          budget={budget}
          label={label}
          isPending={isSaving}
          error={editError}
          onSave={onSave}
          onCancel={onCancel}
        />
      )}
    </motion.li>
  )
}
