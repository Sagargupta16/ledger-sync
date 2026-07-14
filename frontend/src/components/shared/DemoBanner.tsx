import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, LogIn, X } from 'lucide-react'
import { exitDemoMode } from '@/lib/demo'
import { AuthModal } from '@/components/shared/AuthModal'

export function DemoBanner() {
  const [showAuth, setShowAuth] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  if (dismissed) return null

  return (
    <>
      <div className="fixed left-1/2 top-1 z-50 flex min-h-12 max-w-[calc(100vw-4.5rem)] -translate-x-1/2 items-center gap-1.5 rounded-md border border-[var(--hairline-2)] bg-surface-dropdown px-2 py-1 text-sm shadow-[var(--glass-shadow)] sm:top-2 sm:max-w-none sm:gap-2 sm:px-2.5">
        <Eye className="h-4 w-4 flex-shrink-0 text-app-blue" />
        <span className="whitespace-nowrap text-foreground/80">Sample data</span>
        <button
          onClick={() => setShowAuth(true)}
          className="flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-md border border-foreground bg-foreground px-2.5 py-1 text-xs font-medium text-background transition-colors hover:bg-foreground/90 sm:min-h-8"
        >
          <LogIn className="w-3 h-3" />
          Sign up
        </button>
        <button
          onClick={() => { exitDemoMode(queryClient, navigate); setDismissed(true) }}
          className="inline-flex size-11 items-center justify-center rounded-md p-1 text-foreground/40 transition-colors hover:bg-[var(--overlay-5)] hover:text-foreground sm:size-8"
          aria-label="Exit demo"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  )
}
