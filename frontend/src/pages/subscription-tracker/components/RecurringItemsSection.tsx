import type {
  RecurringTransaction,
  RecurringTransactionPatch,
} from '@/hooks/api/useAnalyticsV2'

import { RecurringCard } from './RecurringCard'

type RecurringUpdate = Omit<RecurringTransactionPatch, 'id'>

interface RecurringItemsSectionProps {
  readonly title: string
  readonly description?: string
  readonly items: RecurringTransaction[]
  readonly muted?: boolean
  readonly onUpdate: (id: number, patch: RecurringUpdate) => void
  readonly onDelete: (id: number, name: string) => void
}

export default function RecurringItemsSection({
  title,
  description,
  items,
  muted = false,
  onUpdate,
  onDelete,
}: RecurringItemsSectionProps) {
  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h2 className={`text-sm font-medium ${muted ? 'text-text-tertiary' : 'text-foreground'}`}>
          {title} ({items.length})
        </h2>
        {description && <p className="text-xs text-text-tertiary">{description}</p>}
      </div>
      {items.map((item) => (
        <div key={item.id}>
          <RecurringCard
            item={item}
            onUpdate={(patch) => onUpdate(item.id, patch)}
            onDelete={() => onDelete(item.id, item.name)}
          />
        </div>
      ))}
    </section>
  )
}
