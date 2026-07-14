import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PiggyBank,
  Loader2,
  X,
  LogIn,
} from 'lucide-react'
import * as authApi from '@/services/api/auth'
import type { OAuthProviderConfig } from '@/types'

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
}

function GoogleIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  )
}

function GitHubIcon({ className }: Readonly<{ className?: string }>) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
    </svg>
  )
}

function buildAuthorizeUrl(provider: OAuthProviderConfig): string {
  const params = new URLSearchParams({
    client_id: provider.client_id,
    redirect_uri: provider.redirect_uri,
    scope: provider.scope,
    response_type: 'code',
    state: provider.state,
  })
  if (provider.provider === 'google') {
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
  }
  return `${provider.authorize_url}?${params.toString()}`
}

export function AuthModal({ isOpen, onClose }: Readonly<AuthModalProps>) {
  const modalRef = useRef<HTMLDivElement>(null)
  const closeModal = useEffectEvent(onClose)

  // 'loading' -> providers[] on success. 'failed' when the request errored:
  // a cold serverless backend or network blip must NOT render the "not
  // configured" message (that copy is for a truly empty provider list), so
  // failures get their own retry state instead of collapsing to [].
  const [providersState, setProvidersState] = useState<
    { status: 'loading' | 'failed' } | { status: 'loaded'; providers: OAuthProviderConfig[] }
  >({ status: 'loading' })
  const [retryToken, setRetryToken] = useState(0)

  const retry = () => {
    setProvidersState({ status: 'loading' })
    setRetryToken((t) => t + 1)
  }

  // Fetch available OAuth providers when modal opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    authApi.getOAuthProviders()
      .then((providers) => {
        if (!cancelled) setProvidersState({ status: 'loaded', providers })
      })
      .catch(() => {
        if (!cancelled) setProvidersState({ status: 'failed' })
      })
    return () => { cancelled = true }
  }, [isOpen, retryToken])

  useEffect(() => {
    if (!isOpen) return

    const previouslyFocused =
      document.activeElement instanceof HTMLElement ? document.activeElement : null
    const modal = modalRef.current
    const focusableSelector =
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

    modal?.querySelector<HTMLElement>(focusableSelector)?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        closeModal()
        return
      }
      if (event.key !== 'Tab' || !modal) return

      const focusable = Array.from(
        modal.querySelectorAll<HTMLElement>(focusableSelector),
      )
      if (focusable.length === 0) {
        event.preventDefault()
        modal.focus()
        return
      }

      const first = focusable[0]
      const last = focusable.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen])

  const handleOAuthLogin = (provider: OAuthProviderConfig) => {
    // Navigate to provider's authorize URL -- will redirect back to /auth/callback/:provider
    globalThis.location.assign(buildAuthorizeUrl(provider))
  }

  const isLoadingProviders = providersState.status === 'loading'
  const loadFailed = providersState.status === 'failed'
  const oauthProviders = providersState.status === 'loaded' ? providersState.providers : []
  const googleProvider = oauthProviders.find(p => p.provider === 'google')
  const githubProvider = oauthProviders.find(p => p.provider === 'github')
  const hasOAuth = oauthProviders.length > 0

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            aria-hidden="true"
            className="fixed inset-0 z-50 bg-[var(--modal-backdrop)]"
          />

          {/* Modal */}
          <motion.div
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="auth-modal-title"
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 p-4"
          >
            <div className="relative rounded-lg border border-[var(--hairline-2)] bg-surface-dropdown p-8 shadow-[var(--glass-shadow-strong)]">
              {/* Close Button */}
              <button
                onClick={onClose}
                aria-label="Close sign-in dialog"
                className="absolute right-4 top-4 flex size-11 items-center justify-center rounded-lg text-text-tertiary transition-colors duration-150 ease-out hover:bg-[var(--overlay-3)] hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="flex flex-col items-center mb-8">
                <div className="mb-3 rounded-lg bg-app-blue/10 p-3">
                  <PiggyBank className="w-8 h-8 text-app-blue" />
                </div>
                <h2 id="auth-modal-title" className="text-xl font-semibold text-foreground">
                  Welcome to Ledger Sync
                </h2>
                <p className="text-muted-foreground text-sm mt-1">
                  Sign in to manage your finances
                </p>
              </div>

              {/* OAuth Buttons */}
              {(() => {
                if (isLoadingProviders) {
                  return (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-6 h-6 text-app-blue animate-spin" />
                    </div>
                  )
                }
                if (hasOAuth) {
                  return (
                    <div className="space-y-3">
                      {googleProvider && (
                        <button
                          type="button"
                          onClick={() => handleOAuthLogin(googleProvider)}
                          className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-[var(--hairline-2)] bg-[var(--overlay-3)] px-4 py-3 font-medium text-foreground transition-colors duration-150 ease-out hover:bg-[var(--overlay-5)]"
                        >
                          <GoogleIcon className="w-5 h-5" />
                          Continue with Google
                        </button>
                      )}
                      {githubProvider && (
                        <button
                          type="button"
                          onClick={() => handleOAuthLogin(githubProvider)}
                          className="flex min-h-11 w-full items-center justify-center gap-3 rounded-lg border border-[var(--hairline-2)] bg-[var(--overlay-3)] px-4 py-3 font-medium text-foreground transition-colors duration-150 ease-out hover:bg-[var(--overlay-5)]"
                        >
                          <GitHubIcon className="w-5 h-5" />
                          Continue with GitHub
                        </button>
                      )}
                    </div>
                  )
                }
                if (loadFailed) {
                  return (
                    <div className="text-center py-4">
                      <p className="text-muted-foreground text-sm">
                        Couldn&apos;t reach the sign-in service.
                      </p>
                      <p className="text-text-tertiary text-xs mt-1">
                        The server may be waking up -- this usually takes a few seconds.
                      </p>
                      <button
                        type="button"
                        onClick={retry}
                        className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-app-blue bg-app-blue/10 hover:bg-app-blue/20 transition-colors duration-150"
                      >
                        Try again
                      </button>
                    </div>
                  )
                }
                return (
                  <div className="text-center py-4">
                    <p className="text-muted-foreground text-sm">
                      OAuth sign-in is not configured yet.
                    </p>
                    <p className="text-text-tertiary text-xs mt-1">
                      Contact the administrator to enable Google or GitHub login.
                    </p>
                  </div>
                )
              })()}

              {/* Footer */}
              <p className="text-text-tertiary text-xs text-center mt-6 border-t border-border pt-5">
                By signing in, you agree to our terms of service.
                Your data stays private and secure.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

// Export the LoginButton component for use in HomePage
export function LoginButton({ onClick }: Readonly<{ onClick: () => void }>) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-11 items-center gap-2 rounded-md border border-border-strong bg-[var(--overlay-2)] px-5 py-2.5 font-medium text-foreground transition-colors hover:bg-[var(--overlay-5)] hover:border-border-strong"
    >
      <LogIn className="w-4 h-4" />
      Sign In
    </button>
  )
}
