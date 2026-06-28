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
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-2 text-sm rounded-xl bg-surface-dropdown/90 border border-app-blue/30 backdrop-blur-md shadow-lg">
        <Eye className="w-4 h-4 text-app-blue flex-shrink-0" />
        <span className="text-foreground/80 whitespace-nowrap">Sample data</span>
        <button
          onClick={() => setShowAuth(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium text-foreground bg-app-blue/30 hover:bg-app-blue/50 transition-colors whitespace-nowrap"
        >
          <LogIn className="w-3 h-3" />
          Sign up
        </button>
        <button
          onClick={() => { exitDemoMode(queryClient, navigate); setDismissed(true) }}
          className="inline-flex items-center justify-center min-w-6 min-h-6 p-1 rounded-md text-foreground/40 hover:text-foreground hover:bg-[var(--overlay-5)] transition-colors"
          aria-label="Exit demo"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <AuthModal isOpen={showAuth} onClose={() => setShowAuth(false)} />
    </>
  )
}
