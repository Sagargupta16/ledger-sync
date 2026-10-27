import { motion } from 'motion/react'

import { DURATION, EASING } from '@/constants/animations'
import { cn } from '@/lib/cn'

import { sameLabel } from '../reviewQueueUtils'
import type { CategoryLabel } from '../types'
import PickerRow from './PickerRow'

interface SubcategoryListProps {
  readonly category: string
  readonly subcategories: readonly string[]
  readonly current: CategoryLabel
  readonly onPick: (label: CategoryLabel) => void
}

/** One category's subcategories, with "No subcategory" first. */
export default function SubcategoryList({ category, subcategories, current, onPick }: SubcategoryListProps) {
  return (
    <motion.ul
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.quick, ease: EASING.cinematic }}
      className="mb-1 ml-3 border-l border-[var(--hairline-2)] pl-2"
    >
      {[null, ...subcategories].map((subcategory) => {
        const label = { category, subcategory }
        return (
          <li key={subcategory ?? '(none)'}>
            <PickerRow
              name={subcategory ?? `${category}, no subcategory`}
              isCurrent={sameLabel(label, current)}
              onPick={() => onPick(label)}
            >
              <span className={cn('min-w-0 truncate', subcategory ? 'text-foreground' : 'text-text-tertiary')}>
                {subcategory ?? 'No subcategory'}
              </span>
            </PickerRow>
          </li>
        )
      })}
    </motion.ul>
  )
}
