import { useState, useRef } from 'react'

import { Bookmark, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useSavedViews, useSaveView, useDeleteView } from '@/hooks/api/useSavedViews'
import { useDismissable } from '@/hooks/useDismissable'

import type { FilterValues } from './TransactionFilters'

interface SavedViewsMenuProps {
  currentFilters: FilterValues
  onApply: (filters: FilterValues) => void
}

/**
 * Dropdown in the Transactions filter bar: save the current filter set under
 * a name, apply a saved view, or delete one. Saving upserts by name.
 */
export default function SavedViewsMenu({ currentFilters, onApply }: Readonly<SavedViewsMenuProps>) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const { data: views } = useSavedViews()
  const saveView = useSaveView()
  const deleteView = useDeleteView()

  useDismissable(open, ref, () => setOpen(false))

  const handleSave = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    // FilterValues is an interface (no implicit index signature), so it needs
    // a spread into a fresh object to satisfy Record<string, unknown>.
    saveView.mutate(
      { name: trimmed, filters: { ...currentFilters } },
      {
        onSuccess: () => {
          setName('')
          toast.success('View saved')
        },
        onError: () => toast.error('Failed to save view'),
      },
    )
  }

  const handleDelete = (id: number) => {
    deleteView.mutate(id, {
      onError: () => toast.error('Failed to delete view'),
    })
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-2 px-4 py-2.5 min-h-[44px] rounded-lg border border-border bg-[var(--overlay-2)] transition-colors duration-150 ${open
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-3)]'
          }`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Saved views"
      >
        <Bookmark className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-medium hidden sm:inline">Views</span>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-72 rounded-xl bg-surface-dropdown border border-border shadow-xl z-50 p-3 space-y-3">
          {/* Saved view list */}
          {views && views.length > 0 ? (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {views.map((view) => (
                <li key={view.id} className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      onApply(view.filters as FilterValues)
                      setOpen(false)
                    }}
                    className="flex-1 min-h-[44px] px-3 py-2 text-left text-sm text-foreground rounded-lg hover:bg-[var(--overlay-3)] transition-colors truncate"
                  >
                    {view.name}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(view.id)}
                    className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-app-red hover:bg-app-red/10 transition-colors"
                    aria-label={`Delete view ${view.name}`}
                  >
                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground px-1 py-2">No saved views yet</p>
          )}

          <div className="border-t border-border" />

          {/* Save current view */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSave()
              }}
              placeholder="View name"
              maxLength={100}
              className="w-full px-3 py-2 bg-[var(--overlay-2)] border border-border rounded-lg text-foreground text-sm focus:border-primary focus:outline-none transition-colors min-h-[44px]"
              aria-label="Name for saved view"
            />
            <button
              type="button"
              onClick={handleSave}
              disabled={!name.trim() || saveView.isPending}
              className="shrink-0 px-3 py-2 min-h-[44px] rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saveView.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
