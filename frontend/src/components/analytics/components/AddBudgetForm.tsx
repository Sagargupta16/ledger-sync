import { Button, Input, Select } from '@/components/ui'

interface AddBudgetFormProps {
  categoriesWithoutBudget: string[]
  newCategory: string
  newLimit: string
  onCategoryChange: (value: string) => void
  onLimitChange: (value: string) => void
  onAdd: () => void
  onCancel: () => void
}

export default function AddBudgetForm({
  categoriesWithoutBudget,
  newCategory,
  newLimit,
  onCategoryChange,
  onLimitChange,
  onAdd,
  onCancel,
}: Readonly<AddBudgetFormProps>) {
  return (
    <div className="mb-4 p-4 rounded-xl bg-background/50 border border-border">
      <h4 className="text-sm font-medium mb-3">Add New Budget</h4>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Select
            value={newCategory}
            onChange={(e) => onCategoryChange(e.target.value)}
            options={[
              { value: '', label: 'Select category' },
              ...categoriesWithoutBudget.map((category) => ({ value: category, label: category })),
            ]}
            aria-label="Budget category"
          />
        </div>
        <div className="sm:w-32">
          <Input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            value={newLimit}
            onChange={(e) => onLimitChange(e.target.value)}
            placeholder="Budget limit"
            aria-label="Budget limit"
          />
        </div>
        <Button type="button" onClick={onAdd} disabled={!newCategory || !newLimit}>
          Add
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
