import { Check, Pencil, X } from 'lucide-react'
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

  return (
    <div className="rounded-xl bg-[var(--overlay-2)] border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil size={14} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Display Name</span>
        </div>
        {!isEditing && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onStartEdit}
            className="px-2 text-xs text-app-blue hover:text-app-blue"
          >
            Edit
          </Button>
        )}
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2 mt-2">
          <div className="min-w-0 flex-1">
            <Input
              type="text"
              value={nameInput}
              onChange={(e) => onChangeName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onSave()
                if (e.key === 'Escape') onCancelEdit()
              }}
              autoFocus
              aria-label="Display name"
              placeholder="Your name"
            />
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onSave}
            disabled={isPending}
            aria-label="Save name"
            className="shrink-0 bg-app-blue/15 p-0 text-app-blue hover:bg-app-blue/25 hover:text-app-blue"
          >
            <Check size={14} aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancelEdit}
            aria-label="Cancel"
            className="shrink-0 bg-[var(--overlay-3)] p-0 text-muted-foreground"
          >
            <X size={14} aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <p className="text-sm text-foreground mt-1">{fullName || 'Not set'}</p>
      )}
    </div>
  )
}
