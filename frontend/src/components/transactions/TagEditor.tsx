import { useState, useRef } from 'react'

import { Tag, Plus } from 'lucide-react'
import { toast } from 'sonner'

import { useUpdateTransactionTags } from '@/hooks/api/useTags'
import { useDismissable } from '@/hooks/useDismissable'

const MAX_TAGS = 10
const MAX_TAG_LENGTH = 50

interface TagEditorProps {
  transactionId: string
  tags: string[]
  availableTags: string[]
}

/**
 * Inline popover for editing a transaction's tags: check/uncheck existing
 * tags or add a new one. Apply replaces the full tag list via PUT.
 */
export default function TagEditor({ transactionId, tags, availableTags }: Readonly<TagEditorProps>) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>(tags)
  const [newTag, setNewTag] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const updateTags = useUpdateTransactionTags()

  // Re-seed the draft each time the popover opens (discard stale edits)
  const handleOpen = () => {
    setDraft(tags)
    setNewTag('')
    setOpen(true)
  }

  // Closing by outside click / Escape discards the draft
  useDismissable(open, ref, () => setOpen(false))

  const toggleTag = (tag: string) => {
    setDraft((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleAddNew = () => {
    const trimmed = newTag.trim()
    if (!trimmed || trimmed.length > MAX_TAG_LENGTH) return
    if (draft.includes(trimmed) || draft.length >= MAX_TAGS) return
    setDraft((prev) => [...prev, trimmed])
    setNewTag('')
  }

  const handleApply = () => {
    updateTags.mutate(
      { transactionId, tags: draft },
      {
        onSuccess: () => setOpen(false),
        onError: () => toast.error('Failed to update tags'),
      },
    )
  }

  // All checkable options: known facet tags plus draft-only new ones
  const options = [...new Set([...availableTags, ...draft])]
  const atCap = draft.length >= MAX_TAGS

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-3)] transition-colors"
        title="Edit tags"
        aria-label="Edit tags"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <Tag className="w-4 h-4" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 w-64 space-y-3 rounded-lg border border-border bg-surface-dropdown p-3 shadow-[var(--glass-shadow-strong)]">
          {options.length > 0 ? (
            <ul className="space-y-0.5 max-h-48 overflow-y-auto">
              {options.map((tag) => (
                <li key={tag}>
                  <label className="flex items-center gap-2.5 px-2 py-2 min-h-[44px] rounded-lg hover:bg-[var(--overlay-3)] transition-colors cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.includes(tag)}
                      onChange={() => toggleTag(tag)}
                      className="w-4 h-4 shrink-0 accent-primary"
                    />
                    <span className="text-sm text-foreground truncate">{tag}</span>
                  </label>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground px-1 py-1">No tags yet</p>
          )}

          {/* Add new tag */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTag}
              onChange={(e) => setNewTag(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddNew()
              }}
              placeholder="New tag"
              maxLength={MAX_TAG_LENGTH}
              disabled={atCap}
              className="w-full px-3 py-2 bg-[var(--overlay-2)] border border-border rounded-lg text-foreground text-sm focus:border-primary focus:outline-none transition-colors min-h-[44px] disabled:opacity-50"
              aria-label="New tag name"
            />
            <button
              type="button"
              onClick={handleAddNew}
              disabled={!newTag.trim() || atCap}
              className="shrink-0 p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Add tag"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
          {atCap && (
            <p className="text-xs text-muted-foreground">Maximum of {MAX_TAGS} tags per transaction</p>
          )}

          {/* Apply / Cancel */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-3 py-2 min-h-[44px] rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-[var(--overlay-3)] transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={updateTags.isPending}
              className="px-4 py-2 min-h-[44px] rounded-lg bg-primary/15 text-primary text-sm font-medium hover:bg-primary/25 transition-colors disabled:opacity-50"
            >
              {updateTags.isPending ? 'Saving...' : 'Apply'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
