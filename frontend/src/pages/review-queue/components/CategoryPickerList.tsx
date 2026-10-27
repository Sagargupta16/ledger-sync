import { useState } from 'react'
import { Search } from 'lucide-react'

import { Input } from '@/components/ui'
import type { ReviewCategoryOption } from '@/services/api/reviewQueue'

import type { CategoryLabel } from '../types'
import CategoryRow from './CategoryRow'

interface CategoryPickerListProps {
  readonly options: readonly ReviewCategoryOption[]
  readonly current: CategoryLabel
  readonly onPick: (label: CategoryLabel) => void
}

/** Every category of the row's type, searchable, most used first. */
export default function CategoryPickerList({ options, current, onPick }: CategoryPickerListProps) {
  const [search, setSearch] = useState('')
  const [expanded, setExpanded] = useState<string | null>(current.category)
  const needle = search.trim().toLowerCase()
  const matches = (value: string) => value.toLowerCase().includes(needle)
  const rows = options
    .map((option) => ({
      option,
      subcategories:
        needle && !matches(option.category) ? option.subcategories.filter(matches) : option.subcategories,
    }))
    .filter(({ option, subcategories }) => !needle || matches(option.category) || subcategories.length > 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-4 pt-3">
        <Input
          type="search"
          aria-label="Search categories"
          placeholder="Search categories"
          enterKeyHint="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          icon={<Search className="size-4" />}
        />
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
        {rows.map(({ option, subcategories }) => (
          <CategoryRow
            key={option.category}
            option={option}
            current={current}
            subcategories={subcategories}
            expanded={needle !== '' || expanded === option.category}
            onToggle={() => setExpanded((open) => (open === option.category ? null : option.category))}
            onPick={onPick}
          />
        ))}
        {rows.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-text-tertiary">No category matches "{search.trim()}".</li>
        )}
      </ul>
    </div>
  )
}
