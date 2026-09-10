/**
 * OAuth Callback Page
 *
 * Handles the redirect from OAuth providers (Google, GitHub).
 * Extracts the authorization code from the URL, sends it to the backend,
 * and completes the login flow.
 *
 * Route: /auth/callback/:provider
 */

import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import * as authApi from '@/services/api/auth'
import { prefetchCoreData } from '@/lib/prefetch'
import { ROUTES } from '@/constants'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { AuthModal } from '@/components/shared/AuthModal'
import { Button } from '@/components/ui'

export default function OAuthCallbackPage() {
  const { provider } = useParams<{ provider: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login } = useAuthStore()
  const processedRef = useRef(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [showSignIn, setShowSignIn] = useState(false)
  const [restarting, setRestarting] = useState(false)

  useEffect(() => {
    // Prevent double-processing in React StrictMode
    if (processedRef.current) return
    processedRef.current = true

    // `void navigate(...)` below: react-router types the return as
    // `void | Promise<void>`, but under BrowserRouter (App.tsx) it returns
    // undefined and nothing here depends on the transition finishing.

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')
    const restart = searchParams.get('restart')
    // Remove credentials from browser history before any network request or retry.
    setSearchParams({}, { replace: true })

    const handleCallback = async () => {
      try {
        if (restart === '2') {
          setRestarting(true)
          const providers = await authApi.getOAuthProviders()
          const config = providers.find(item => item.provider === provider)
          if (!config) throw new Error('This sign-in provider is not configured. Please choose another.')
          const url = await authApi.beginOAuthLogin(config)
          globalThis.location.assign(url)
          return
        }
        if (error) {
          if (provider && state) authApi.cancelOAuthLogin(provider, state)
          throw new Error(
            error === 'access_denied'
              ? 'Sign-in was cancelled. You can start again when you are ready.'
              : 'The provider could not complete sign-in. Please start again.',
          )
        }
        if (!code || !state || !provider) {
          throw new Error('The sign-in response is incomplete. Please start sign-in again.')
        }

        // Validate and consume this tab's attempt before changing its current session.
        const tokens = await authApi.oauthCallback(provider, code, state)
        const user = await authApi.getMe(tokens.access_token)

        // Clear demo mode if active (real login replaces demo session)
        if (useDemoStore.getState().isDemoMode) {
          useDemoStore.getState().exitDemo()
        }

        login(user, tokens)

        // Prefetch data
        prefetchCoreData()

        toast.success('Signed in successfully!')
        void navigate(ROUTES.DASHBOARD, { replace: true })
      } catch (err) {
        setErrorMessage(getApiErrorMessage(err, 'Sign-in failed. Please start sign-in again.'))
      }
    }

    void handleCallback()
  }, [provider, searchParams, setSearchParams, navigate, login])

  if (errorMessage) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <h1 className="text-xl font-semibold text-foreground">Sign-in could not be completed</h1>
          <p role="alert" className="mt-3 text-sm text-muted-foreground">{errorMessage}</p>
          <div className="mt-6 flex flex-col gap-3">
            <Button onClick={() => setShowSignIn(true)}>Sign in again</Button>
            <Button
              variant="ghost"
              onClick={() => { void navigate(ROUTES.HOME, { replace: true }) }}
            >
              Return home
            </Button>
          </div>
        </div>
        <AuthModal isOpen={showSignIn} onClose={() => setShowSignIn(false)} />
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-app-blue animate-spin" />
        <p className="text-muted-foreground text-sm">
          {restarting ? 'Starting a fresh sign-in...' : 'Completing sign in...'}
        </p>
      </div>
    </div>
  )
}
