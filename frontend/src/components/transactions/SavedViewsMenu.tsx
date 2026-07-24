import { useState, useRef } from 'react'

import { Bookmark, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { useSavedViews, useSaveView, useDeleteView } from '@/hooks/api/useSavedViews'
import { useDismissable } from '@/hooks/useDismissable'
import { Button, Input } from '@/components/ui'

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
      <Button
        type="button"
        variant="secondary"
        size="md"
        onClick={() => setOpen(!open)}
        className={`px-4 ${open
            ? 'text-foreground'
            : 'text-muted-foreground hover:text-foreground'
          }`}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label="Saved views"
      >
        <Bookmark className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm font-medium hidden sm:inline">Views</span>
      </Button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-72 space-y-3 rounded-lg border border-border bg-surface-dropdown p-3 shadow-[var(--glass-shadow-strong)]">
          {/* Saved view list */}
          {views && views.length > 0 ? (
            <ul className="space-y-1 max-h-56 overflow-y-auto">
              {views.map((view) => (
                <li key={view.id} className="flex items-center gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => {
                      onApply(view.filters as FilterValues)
                      setOpen(false)
                    }}
                    className="min-w-0 flex-1 justify-start truncate px-3 text-sm"
                    title={view.name}
                  >
                    {view.name}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="md"
                    onClick={() => handleDelete(view.id)}
                    className="shrink-0 p-0 text-app-red hover:bg-app-red/10 hover:text-app-red"
                    aria-label={`Delete view ${view.name}`}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground px-1 py-2">No saved views yet</p>
          )}

          <div className="border-t border-border" />

          {/* Save current view */}
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1">
              <Input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave()
                }}
                placeholder="View name"
                maxLength={100}
                aria-label="Name for saved view"
              />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="md"
              onClick={handleSave}
              disabled={!name.trim() || saveView.isPending}
              className="shrink-0 bg-primary/15 px-3 text-primary hover:bg-primary/25 hover:text-primary"
            >
              {saveView.isPending ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
