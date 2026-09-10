import { useId, useState } from 'react'

import { Button, Input, Select } from '@/components/ui'
import { BASE_CURRENCY } from '@/constants/currencies'
import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import { useBudgets, useCreateBudget } from '@/hooks/api/useAnalyticsV2'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { useDemoStore } from '@/store/demoStore'

interface CreateBudgetFormProps {
  defaultAlertThreshold: number
  onCancel: () => void
  onCreated: (category: string) => void
}

export default function CreateBudgetForm({
  defaultAlertThreshold,
  onCancel,
  onCreated,
}: Readonly<CreateBudgetFormProps>) {
  const formId = useId()
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const categoryQuery = useCategoryBreakdown({ transaction_type: 'expense' })
  const budgetsQuery = useBudgets({ active_only: true })
  const createBudget = useCreateBudget()
  const [category, setCategory] = useState('')
  const [monthlyLimit, setMonthlyLimit] = useState('')
  const [alertThreshold, setAlertThreshold] = useState(String(defaultAlertThreshold))
  const [error, setError] = useState<string | null>(null)

  const existingCategories = new Set(
    (budgetsQuery.data ?? []).filter((budget) => !budget.subcategory).map((budget) => budget.category),
  )
  const availableCategories = Object.keys(categoryQuery.data?.categories ?? {})
    .filter((name) => !existingCategories.has(name))
    .sort((a, b) => a.localeCompare(b))
  const isLoading = categoryQuery.isPending || budgetsQuery.isPending
  const isError = categoryQuery.isError || budgetsQuery.isError
  const isUnavailable = isLoading || isError || availableCategories.length === 0

  const handleSubmit = (event: React.SubmitEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (isDemoMode || isUnavailable || createBudget.isPending) return
    if (!event.currentTarget.reportValidity()) return
    if (!availableCategories.includes(category)) return

    setError(null)
    createBudget.mutate({
      category,
      monthly_limit: Number(monthlyLimit),
      alert_threshold: Number(alertThreshold),
    }, {
      onSuccess: () => onCreated(category),
      onError: (cause) => setError(getApiErrorMessage(cause, 'Could not create the budget. Please try again.')),
    })
  }

  return (
    <form
      onSubmit={handleSubmit}
      aria-labelledby={`${formId}-title`}
      aria-busy={isLoading || createBudget.isPending}
      className="space-y-4 rounded-md border border-[var(--hairline-2)] bg-[var(--overlay-2)] p-4"
    >
      <div>
        <h4 id={`${formId}-title`} className="text-sm font-semibold text-foreground">
          Create a monthly budget
        </h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Choose a category and review the limit and alert threshold before saving.
          This creates one budget separately from saving your settings.
        </p>
      </div>
      {isDemoMode && (
        <p className="text-sm text-muted-foreground">
          Demo mode is read-only. You can preview the form; creating a budget requires your own account.
        </p>
      )}
      {isLoading && <output className="block text-sm text-muted-foreground">Loading budget categories...</output>}
      {isError && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-app-red">
            Could not load categories and existing budgets.
          </p>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => { void categoryQuery.refetch(); void budgetsQuery.refetch() }}
          >
            Retry
          </Button>
        </div>
      )}
      {!isLoading && !isError && availableCategories.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No expense categories are available for a new budget. Import expense transactions
          or use a category that does not already have a budget.
        </p>
      )}
      <fieldset disabled={isUnavailable || createBudget.isPending} className="min-w-0 space-y-4 border-0 p-0">
        <legend className="sr-only">Monthly budget details</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Select
            id={`${formId}-category`}
            label="Expense category"
            value={category}
            required
            autoFocus
            onChange={(event) => setCategory(event.target.value)}
            options={[
              { value: '', label: 'Select an expense category' },
              ...availableCategories.map((name) => ({ value: name, label: name })),
            ]}
          />
          <Input
            id={`${formId}-limit`}
            label={`Monthly budget limit (${BASE_CURRENCY})`}
            type="number"
            inputMode="decimal"
            min="0.01"
            step="0.01"
            required
            value={monthlyLimit}
            onChange={(event) => setMonthlyLimit(event.target.value)}
          />
          <Input
            id={`${formId}-threshold`}
            label="Alert threshold (%)"
            type="number"
            inputMode="decimal"
            min="0"
            max="100"
            step="any"
            required
            value={alertThreshold}
            onChange={(event) => setAlertThreshold(event.target.value)}
          />
        </div>
        {error && <p role="alert" className="text-sm text-app-red">{error}</p>}
        <Button type="submit" isLoading={createBudget.isPending} disabled={isDemoMode}>
          Create budget
        </Button>
      </fieldset>
      <Button type="button" variant="secondary" disabled={createBudget.isPending} onClick={onCancel}>
        Cancel
      </Button>
    </form>
  )
}
