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
    <div className="rounded-xl bg-white/[0.04] border border-border p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Pencil size={14} className="text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Display Name</span>
        </div>
        {!isEditing && (
          <button
            type="button"
            onClick={onStartEdit}
            className="text-xs text-blue-400 hover:text-blue-300 transition-colors duration-150 ease-out"
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
            className="flex-1 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg text-white text-sm focus:border-blue-500/50 focus:outline-none transition-colors duration-150 ease-out"
            placeholder="Your name"
          />
          <button
            type="button"
            onClick={onSave}
            disabled={isPending}
            className="p-1.5 rounded-lg bg-blue-500/15 text-blue-400 hover:bg-blue-500/25 transition-colors duration-150 ease-out disabled:opacity-50"
          >
            <Check size={14} />
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="p-1.5 rounded-lg bg-white/[0.06] text-muted-foreground hover:bg-white/[0.10] transition-colors duration-150 ease-out"
          >
            <X size={14} />
          </button>
        </div>
      ) : (
        <p className="text-sm text-white mt-1">{fullName || 'Not set'}</p>
      )}
    </div>
  )
}
