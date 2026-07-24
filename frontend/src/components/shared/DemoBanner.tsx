import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Eye, LogIn, X } from 'lucide-react'
import { exitDemoMode } from '@/lib/demo'
import { AuthModal } from '@/components/shared/AuthModal'
import { Button } from '@/components/ui'

export function DemoBanner() {
  const [showAuth, setShowAuth] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  if (dismissed) return null

  return (
    <>
      <div className="fixed left-[calc(env(safe-area-inset-left,0px)+4rem)] right-[max(0.5rem,env(safe-area-inset-right,0px))] top-[calc(env(safe-area-inset-top,0px)+0.25rem)] z-50 flex min-h-12 max-w-[calc(100vw-4.5rem)] items-center gap-1.5 rounded-md border border-[var(--hairline-2)] bg-surface-dropdown px-2 py-1 text-sm shadow-[var(--glass-shadow)] sm:left-1/2 sm:right-auto sm:top-[calc(env(safe-area-inset-top,0px)+0.5rem)] sm:max-w-none sm:-translate-x-1/2 sm:gap-2 sm:px-2.5">
        <Eye className="h-4 w-4 flex-shrink-0 text-app-blue" />
        <span className="whitespace-nowrap text-foreground/80">Sample data</span>
        <Button
          type="button"
          size="sm"
          onClick={() => setShowAuth(true)}
          className="px-2.5 text-xs"
        >
          <LogIn className="size-3" aria-hidden="true" />
          Sign up
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => { exitDemoMode(queryClient, navigate); setDismissed(true) }}
          className="size-11 p-0 text-foreground/40 lg:pointer-fine:size-8 lg:pointer-fine:min-h-8 lg:pointer-fine:min-w-8"
          title="Exit demo and clear sample data"
          aria-label="Exit demo"
        >
          <X className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  )
}
