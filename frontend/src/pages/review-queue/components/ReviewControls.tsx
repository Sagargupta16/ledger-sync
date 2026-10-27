import { Check, Pencil, Undo2 } from 'lucide-react'

import { Button } from '@/components/ui'

interface ReviewControlsProps {
  readonly canUndo: boolean
  readonly onKeep: () => void
  readonly onChange: () => void
  readonly onUndo: () => void
}

/**
 * Below `sm` the buttons lose half their side padding and Change gets the wider
 * column, so no label breaks inside a word on a 320 px phone.
 */
const COMPACT = 'px-2 sm:px-4'

/** Shown on wide screens; the button announces it through `aria-keyshortcuts`. */
function Key({ children }: Readonly<{ children: string }>) {
  return (
    <kbd
      aria-hidden="true"
      className="ml-1 hidden rounded border border-[var(--hairline-3)] bg-[var(--overlay-2)] px-1.5 py-0.5 text-[10px] font-medium leading-none text-text-tertiary lg:inline-block"
    >
      {children}
    </kbd>
  )
}

/** The swipe actions as buttons, with their keys on wide screens. Shown only with a card on top. */
export default function ReviewControls({ canUndo, onKeep, onChange, onUndo }: ReviewControlsProps) {
  return (
    <div className="mx-auto w-full max-w-md space-y-3">
      <div className="grid grid-cols-[1fr_1.25fr_1fr] gap-2 sm:grid-cols-3">
        <Button
          variant="ghost"
          size="lg"
          className={COMPACT}
          icon={<Undo2 className="size-4" />}
          onClick={onUndo}
          disabled={!canUndo}
          aria-keyshortcuts="U"
        >
          Undo
          <Key>U</Key>
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className={COMPACT}
          icon={<Pencil className="size-4" />}
          onClick={onChange}
          aria-keyshortcuts="C"
        >
          Change
          <Key>C</Key>
        </Button>
        <Button
          variant="primary"
          size="lg"
          className={COMPACT}
          icon={<Check className="size-4" />}
          onClick={onKeep}
          aria-keyshortcuts="K"
        >
          Keep
          <Key>K</Key>
        </Button>
      </div>
      <p className="text-center text-xs text-text-tertiary">
        <span className="lg:hidden">Swipe right to keep the category, left to change it.</span>
        <span className="hidden lg:inline">Drag the card, or press K to keep, C to change, U to undo.</span>
      </p>
    </div>
  )
}
