import { motion } from 'framer-motion'

import type {
  RecurringTransaction,
  RecurringTransactionPatch,
} from '@/hooks/api/useAnalyticsV2'

import { RecurringCard } from './RecurringCard'

type RecurringUpdate = Omit<RecurringTransactionPatch, 'id'>

interface RecurringItemsSectionProps {
  readonly title: string
  readonly items: RecurringTransaction[]
  readonly muted?: boolean
  readonly onUpdate: (id: number, patch: RecurringUpdate) => void
  readonly onDelete: (id: number, name: string) => void
}

export default function RecurringItemsSection({
  title,
  items,
  muted = false,
  onUpdate,
  onDelete,
}: RecurringItemsSectionProps) {
  if (items.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className={`text-sm font-medium ${muted ? 'text-text-tertiary' : 'text-foreground'}`}>
        {title} ({items.length})
      </h2>
      {items.map((item) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <RecurringCard
            item={item}
            onUpdate={(patch) => onUpdate(item.id, patch)}
            onDelete={() => onDelete(item.id, item.name)}
          />
        </motion.div>
      ))}
    </section>
  )
}
