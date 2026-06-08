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
      <div className="flex gap-3">
        <select
          value={newCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg bg-background/50 border border-border text-sm"
        >
          <option value="">Select category</option>
          {categoriesWithoutBudget.map((cat) => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>
        <input
          type="number"
          inputMode="decimal"
          value={newLimit}
          onChange={(e) => onLimitChange(e.target.value)}
          placeholder="Budget limit"
          className="w-32 px-3 py-2 rounded-lg bg-background/50 border border-border text-sm"
        />
        <button
          onClick={onAdd}
          disabled={!newCategory || !newLimit}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm disabled:opacity-50"
        >
          Add
        </button>
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg bg-muted text-muted-foreground text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
