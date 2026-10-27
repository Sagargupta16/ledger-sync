import { ChevronDown } from 'lucide-react'

import { cn } from '@/lib/cn'
import type { ReviewCategoryOption } from '@/services/api/reviewQueue'

import { sameLabel } from '../reviewQueueUtils'
import type { CategoryLabel } from '../types'
import PickerRow, { PICKER_ROW } from './PickerRow'
import SubcategoryList from './SubcategoryList'

interface CategoryRowProps {
  readonly option: ReviewCategoryOption
  readonly current: CategoryLabel
  /** The subcategories to list: all of them, or those a search matched. */
  readonly subcategories: readonly string[]
  readonly expanded: boolean
  readonly onToggle: () => void
  readonly onPick: (label: CategoryLabel) => void
}

/** A category without subcategories is picked at once; one with them opens their list. */
export default function CategoryRow({ option, current, subcategories, expanded, onToggle, onPick }: CategoryRowProps) {
  const categoryName = <span className="min-w-0 truncate font-medium text-foreground">{option.category}</span>
  if (option.subcategories.length === 0) {
    const bare = { category: option.category, subcategory: null }
    return (
      <li>
        <PickerRow
          name={option.category}
          isCurrent={sameLabel(bare, current)}
          onPick={() => onPick(bare)}
          aside={<span className="shrink-0 text-xs tabular-nums text-text-tertiary">{option.count}</span>}
        >
          {categoryName}
        </PickerRow>
      </li>
    )
  }
  return (
    <li>
      <button type="button" className={PICKER_ROW} aria-expanded={expanded} onClick={onToggle}>
        {categoryName}
        <ChevronDown
          aria-hidden="true"
          className={cn('size-4 shrink-0 text-text-tertiary transition-transform duration-200', expanded && 'rotate-180')}
        />
      </button>
      {expanded && (
        <SubcategoryList
          category={option.category}
          subcategories={subcategories}
          current={current}
          onPick={onPick}
        />
      )}
    </li>
  )
}
