import { useEffect, useRef } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Input } from '@/components/ui'

interface EditNameRowProps {
  fullName: string | null | undefined
  isEditing: boolean
  nameInput: string
  isPending: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onChangeName: (v: string) => void
  onSave: () => void
}

export function EditNameRow(props: Readonly<EditNameRowProps>) {
  const { fullName, isEditing, nameInput, isPending, onStartEdit, onCancelEdit, onChangeName, onSave } =
    props
  const inputRef = useRef<HTMLInputElement>(null)
  const editRef = useRef<HTMLButtonElement>(null)
  const wasEditing = useRef(false)
  const canSave = Boolean(nameInput.trim()) && nameInput.trim() !== (fullName ?? '').trim() && !isPending
  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    } else if (wasEditing.current) {
      editRef.current?.focus()
    }
    wasEditing.current = isEditing
  }, [isEditing])

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium">Display name</span>
        {!isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            ref={editRef}
            onClick={onStartEdit}
            disabled={isPending}
            icon={<Pencil className="size-3.5" />}
            aria-label="Edit display name"
          >
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <form className="mt-2 space-y-3" onSubmit={(event) => {
          event.preventDefault()
          if (canSave) onSave()
        }}>
          <Input
            ref={inputRef}
            type="text"
            value={nameInput}
            onChange={(e) => onChangeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                if (!isPending) onCancelEdit()
              }
            }}
            aria-label="Display name"
            autoComplete="name"
            required
            disabled={isPending}
            placeholder="Your name"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!canSave}
              isLoading={isPending}
            >
              {isPending ? 'Saving...' : 'Save name'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancelEdit}
              disabled={isPending}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <p className="mt-1 break-words text-sm text-muted-foreground [overflow-wrap:anywhere]">{fullName || 'Not set'}</p>
      )}
    </div>
  )
}
