import { ArrowUpDown } from 'lucide-react'
import type { SortKey } from './types'

interface SortButtonProps {
  label: string
  sortKey: SortKey
  currentSort: SortKey
  onSort: (key: SortKey) => void
}

export function SortButton({
  label,
  sortKey,
  currentSort,
  onSort,
}: Readonly<SortButtonProps>) {
  const isActive = currentSort === sortKey
  return (
    <button
      onClick={() => onSort(sortKey)}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
        isActive
          ? 'bg-ios-blue/20 text-ios-blue border border-ios-blue/30'
          : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white border border-transparent'
      }`}
    >
      {label}
      {isActive && <ArrowUpDown className="w-3 h-3" />}
    </button>
  )
}
