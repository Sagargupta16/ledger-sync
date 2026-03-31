/**
 * OAuth Callback Page
 *
 * Handles the redirect from OAuth providers (Google, GitHub).
 * Extracts the authorization code from the URL, sends it to the backend,
 * and completes the login flow.
 *
 * Route: /auth/callback/:provider
 */

import { useEffect, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import { useAuthStore } from '@/store/authStore'
import * as authApi from '@/services/api/auth'
import { prefetchCoreData } from '@/lib/prefetch'
import { ROUTES } from '@/constants'
import { getApiErrorMessage } from '@/lib/errorUtils'

export default function OAuthCallbackPage() {
  const { provider } = useParams<{ provider: string }>()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const { login, setTokens } = useAuthStore()
  const processedRef = useRef(false)

  useEffect(() => {
    // Prevent double-processing in React StrictMode
    if (processedRef.current) return
    processedRef.current = true

    const code = searchParams.get('code')
    const state = searchParams.get('state')
    const error = searchParams.get('error')

    if (error) {
      toast.error(`OAuth error: ${error}`)
      navigate(ROUTES.HOME, { replace: true })
      return
    }

    if (!code || !provider) {
      toast.error('Invalid OAuth callback')
      navigate(ROUTES.HOME, { replace: true })
      return
    }

    const handleCallback = async () => {
      try {
        // Exchange code for tokens (state is validated server-side)
        const tokens = await authApi.oauthCallback(provider, code, state ?? undefined)
        setTokens(tokens)

        // Fetch user profile
        const user = await authApi.getMe()
        login(user, tokens)

        // Prefetch data
        prefetchCoreData()

        toast.success('Signed in successfully!')
        navigate(ROUTES.DASHBOARD, { replace: true })
      } catch (err) {
        const message = getApiErrorMessage(err)
        toast.error(message)
        navigate(ROUTES.HOME, { replace: true })
      }
    }

    handleCallback()
  }, [provider, searchParams, navigate, login, setTokens])

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="flex flex-col items-center gap-4">
        <Loader2 className="w-10 h-10 text-ios-blue animate-spin" />
        <p className="text-muted-foreground text-sm">
          Completing sign in...
        </p>
      </div>
    </div>
  )
}
