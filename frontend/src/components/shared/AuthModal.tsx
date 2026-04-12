import { useState, useEffect } from 'react'
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
  // null = not yet fetched, [] = fetched but empty
  const [oauthProviders, setOauthProviders] = useState<OAuthProviderConfig[] | null>(null)

  // Fetch available OAuth providers when modal opens
  useEffect(() => {
    if (!isOpen) return
    let cancelled = false
    authApi.getOAuthProviders()
      .then((providers) => { if (!cancelled) setOauthProviders(providers) })
      .catch(() => { if (!cancelled) setOauthProviders([]) })
    return () => { cancelled = true }
  }, [isOpen])

  const handleOAuthLogin = (provider: OAuthProviderConfig) => {
    // Navigate to provider's authorize URL — will redirect back to /auth/callback/:provider
    globalThis.location.assign(buildAuthorizeUrl(provider))
  }

  const isLoadingProviders = oauthProviders === null
  const googleProvider = oauthProviders?.find(p => p.provider === 'google')
  const githubProvider = oauthProviders?.find(p => p.provider === 'github')
  const hasOAuth = (oauthProviders?.length ?? 0) > 0

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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-md z-50 p-4"
          >
            <div className="relative bg-[#1a1a1c] rounded-2xl p-8 border border-white/[0.08] shadow-2xl">
              {/* Close Button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 p-2 rounded-lg text-text-tertiary hover:text-white hover:bg-white/[0.06] transition-colors duration-150 ease-out"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Header */}
              <div className="flex flex-col items-center mb-8">
                <div className="p-3 rounded-xl bg-blue-500/10 mb-3">
                  <PiggyBank className="w-8 h-8 text-blue-400" />
                </div>
                <h2 className="text-xl font-semibold text-white">
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
                          className="w-full py-3 px-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all duration-150 ease-out bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10]"
                        >
                          <GoogleIcon className="w-5 h-5" />
                          Continue with Google
                        </button>
                      )}
                      {githubProvider && (
                        <button
                          type="button"
                          onClick={() => handleOAuthLogin(githubProvider)}
                          className="w-full py-3 px-4 rounded-xl font-medium text-white flex items-center justify-center gap-3 transition-all duration-150 ease-out bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.10]"
                        >
                          <GitHubIcon className="w-5 h-5" />
                          Continue with GitHub
                        </button>
                      )}
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
      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white transition-colors hover:scale-105 border border-border-strong hover:border-border-strong bg-white/5 hover:bg-white/10"
    >
      <LogIn className="w-4 h-4" />
      Sign In
    </button>
  )
}
