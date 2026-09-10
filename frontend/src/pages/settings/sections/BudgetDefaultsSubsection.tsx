/**
 * Budget Defaults sub-section within Financial Settings.
 */

import { useId, useState } from 'react'
import { PiggyBank, Plus } from 'lucide-react'
import { Button } from '@/components/ui'
import CreateBudgetForm from '@/pages/budget/components/CreateBudgetForm'
import type { LocalPrefs, LocalPrefKey } from '../types'
import { FieldHint, FieldLabel } from '../sectionPrimitives'
import { inputClass } from '../styles'

interface Props {
  localPrefs: LocalPrefs
  updateLocalPref: <K extends LocalPrefKey>(key: K, value: LocalPrefs[K]) => void
}

export default function BudgetDefaultsSubsection({
  localPrefs,
  updateLocalPref,
}: Readonly<Props>) {
  const setupId = useId()
  const [isCreating, setIsCreating] = useState(false)
  const [createdCategory, setCreatedCategory] = useState('')

  return (
    <div className="space-y-4 border-t border-border pt-3">
      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
          <PiggyBank className="size-4 text-primary" aria-hidden="true" />
          Budget defaults
        </h3>
        <p className="text-sm leading-6 text-muted-foreground">
          Set a monthly limit for an expense category to enable budget alerts.
          Budgets are created only when you submit the setup form.
        </p>
      </div>
      <div className="grid grid-cols-1 items-start gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="alert-threshold">Default alert threshold (%)</FieldLabel>
          <input
            id="alert-threshold"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            value={localPrefs.default_budget_alert_threshold}
            onChange={(e) =>
              updateLocalPref('default_budget_alert_threshold', Number(e.target.value))
            }
            className={inputClass}
          />
          <FieldHint>
            Copied into the setup form. Each budget keeps its own threshold.
            Save settings to reuse this default later.
          </FieldHint>
        </div>
        <div className="space-y-2 sm:pt-7">
          <Button
            type="button"
            variant="secondary"
            icon={<Plus className="size-4" />}
            disabled={isCreating}
            aria-expanded={isCreating}
            aria-controls={setupId}
            onClick={() => { setCreatedCategory(''); setIsCreating(true) }}
          >
            Set up a budget
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Automatic creation and rollover are not part of this setup.
          </p>
        </div>
      </div>
      <output aria-live="polite" className="block text-sm text-app-green">
        {createdCategory ? `Monthly budget created for ${createdCategory}.` : ''}
      </output>
      <div id={setupId}>
        {isCreating && (
          <CreateBudgetForm
            defaultAlertThreshold={localPrefs.default_budget_alert_threshold}
            onCancel={() => setIsCreating(false)}
            onCreated={(category) => {
              setCreatedCategory(category)
              setIsCreating(false)
            }}
          />
        )}
      </div>
    </div>
  )
}
