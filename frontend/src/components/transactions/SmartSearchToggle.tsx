import { Sparkles } from 'lucide-react'

import { Button } from '@/components/ui'

interface SmartSearchToggleProps {
  pressed: boolean
  onChange: (enabled: boolean) => void
}

/**
 * Switches the Transactions search box between matching words and ranking by
 * meaning (semantic search). One label in every state; aria-pressed carries it.
 */
export default function SmartSearchToggle({ pressed, onChange }: Readonly<SmartSearchToggleProps>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="md"
      onClick={() => onChange(!pressed)}
      className={`px-3 lg:min-h-10 ${pressed
          ? 'bg-app-blue/15 text-app-blue hover:text-app-blue'
          : 'text-muted-foreground'
        }`}
      aria-pressed={pressed}
      aria-label="Smart search"
      title="Find transactions by meaning, not only matching words"
    >
      <Sparkles className="size-4" aria-hidden="true" />
      <span className="text-sm font-medium">
        Smart<span className="hidden sm:inline"> search</span>
      </span>
    </Button>
  )
}
