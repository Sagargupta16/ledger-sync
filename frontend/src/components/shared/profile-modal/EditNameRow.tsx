import { Check, Pencil, X } from 'lucide-react'

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
          <button
            type="button"
            onClick={onStartEdit}
            className="text-xs text-app-blue hover:text-app-blue transition-colors duration-150 ease-out"
          >
            Edit
          </button>
        )}
      </div>

      {isEditing ? (
        <div className="flex items-center gap-2 mt-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => onChangeName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSave()
              if (e.key === 'Escape') onCancelEdit()
            }}
            autoFocus
            className="flex-1 px-3 py-1.5 bg-[var(--overlay-2)] border border-[var(--hairline-2)] rounded-lg text-foreground text-sm focus:border-app-blue/50 focus:outline-none transition-colors duration-150 ease-out"
            placeholder="Your name"
          />
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            aria-label="Save name"
            className="p-1.5 rounded-lg bg-app-blue/15 text-app-blue hover:bg-app-blue/25 transition-colors duration-150 ease-out disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            aria-label="Cancel"
            className="p-1.5 rounded-lg bg-[var(--overlay-3)] text-muted-foreground hover:bg-[var(--overlay-5)] transition-colors duration-150 ease-out"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <p className="text-sm text-foreground mt-1">{fullName || 'Not set'}</p>
      )}
    </div>
  )
}
