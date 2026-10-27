import { AnimatePresence } from 'motion/react'

import type { ReviewCategoryOption, ReviewItem } from '@/services/api/reviewQueue'

import type { CategoryLabel } from '../types'
import PickerSheet from './PickerSheet'

interface CategoryPickerProps {
  readonly open: boolean
  readonly item: ReviewItem | null
  readonly options: readonly ReviewCategoryOption[]
  readonly onPick: (label: CategoryLabel) => void
  readonly onClose: () => void
}

/** Picks the row's new category: the suggester's picks first, then every category of its type. */
export default function CategoryPicker({ open, item, ...props }: CategoryPickerProps) {
  return (
    <AnimatePresence>
      {open && item && <PickerSheet key={item.transaction_id} item={item} {...props} />}
    </AnimatePresence>
  )
}
