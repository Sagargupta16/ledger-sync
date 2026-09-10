import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthTokens, User } from '@/types'

import OAuthCallbackPage from '../OAuthCallbackPage'

const mocks = vi.hoisted(() => ({
  exitDemo: vi.fn(),
  getMe: vi.fn(),
  login: vi.fn(),
  oauthCallback: vi.fn(),
  cancelOAuthLogin: vi.fn(),
  getOAuthProviders: vi.fn(),
  beginOAuthLogin: vi.fn(),
  prefetchCoreData: vi.fn(),
  setTokens: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/services/api/auth', () => ({
  getMe: mocks.getMe,
  oauthCallback: mocks.oauthCallback,
  cancelOAuthLogin: mocks.cancelOAuthLogin,
  getOAuthProviders: mocks.getOAuthProviders,
  beginOAuthLogin: mocks.beginOAuthLogin,
}))

vi.mock('@/store/authStore', () => ({
  useAuthStore: () => ({
    login: mocks.login,
    setTokens: mocks.setTokens,
  }),
}))

vi.mock('@/store/demoStore', () => ({
  useDemoStore: {
    getState: () => ({
      exitDemo: mocks.exitDemo,
      isDemoMode: false,
    }),
  },
}))

vi.mock('@/lib/prefetch', () => ({
  prefetchCoreData: mocks.prefetchCoreData,
}))

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: mocks.toastSuccess,
  },
}))

const TOKENS: AuthTokens = {
  access_token: 'access-token',
  refresh_token: 'refresh-token',
  token_type: 'bearer',
}

const USER: User = {
  id: 7,
  email: 'sagar@example.com',
  full_name: 'Sagar Gupta',
  is_active: true,
  is_verified: true,
  auth_provider: 'google',
  created_at: '2026-07-14T00:00:00Z',
  last_login: '2026-07-14T00:00:00Z',
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.oauthCallback.mockResolvedValue(TOKENS)
  mocks.getMe.mockResolvedValue(USER)
  mocks.getOAuthProviders.mockResolvedValue([])
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OAuthCallbackPage', () => {
  it('exchanges the callback code and completes sign in', async () => {
    render(
      <MemoryRouter
        initialEntries={['/auth/callback/google?code=oauth-code&state=oauth-state']}
      >
        <Routes>
          <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
          <Route path="/dashboard" element={<div>Dashboard destination</div>} />
        </Routes>
      </MemoryRouter>,
    )

    expect(await screen.findByText('Dashboard destination')).toBeInTheDocument()
    expect(mocks.oauthCallback).toHaveBeenCalledWith(
      'google',
      'oauth-code',
      'oauth-state',
    )
    expect(mocks.setTokens).not.toHaveBeenCalled()
    expect(mocks.getMe).toHaveBeenCalledExactlyOnceWith(TOKENS.access_token)
    expect(mocks.login).toHaveBeenCalledWith(USER, TOKENS)
    expect(mocks.prefetchCoreData).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Signed in successfully!')

    await waitFor(() => expect(mocks.toastError).not.toHaveBeenCalled())
  })

  it('processes a callback only once in StrictMode', async () => {
    render(
      <StrictMode>
        <MemoryRouter initialEntries={['/auth/callback/google?code=code&state=state']}>
          <Routes>
            <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
            <Route path="/dashboard" element={<div>Dashboard destination</div>} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )
    expect(await screen.findByText('Dashboard destination')).toBeInTheDocument()
    expect(mocks.oauthCallback).toHaveBeenCalledOnce()
  })

  it('offers a fresh sign-in after an expired or mismatched attempt', async () => {
    mocks.oauthCallback.mockRejectedValueOnce(new Error('This sign-in attempt has expired.'))
    render(
      <MemoryRouter initialEntries={['/auth/callback/google?code=code&state=state']}>
        <Routes>
          <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('expired')
    expect(mocks.setTokens).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.exitDemo).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Sign in again' }))
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Welcome to Ledger Sync')
  })

  it('handles cancellation without exchanging a code', async () => {
    render(
      <MemoryRouter initialEntries={['/auth/callback/github?error=access_denied&state=state']}>
        <Routes>
          <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('cancelled')
    expect(mocks.cancelOAuthLogin).toHaveBeenCalledWith('github', 'state')
    expect(mocks.oauthCallback).not.toHaveBeenCalled()
    expect(mocks.setTokens).not.toHaveBeenCalled()
  })

  it('preserves the current session when the new profile cannot be fetched', async () => {
    mocks.getMe.mockRejectedValueOnce(new Error('Could not load your profile. Please sign in again.'))
    render(
      <MemoryRouter initialEntries={['/auth/callback/google?code=code&state=state']}>
        <Routes>
          <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Could not load your profile')
    expect(mocks.setTokens).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.exitDemo).not.toHaveBeenCalled()
  })

  it('starts fresh PKCE after a versioned restart and never exchanges old callback data', async () => {
    const config = {
      provider: 'github',
      client_id: 'synthetic-client',
      authorize_url: 'https://github.com/login/oauth/authorize',
      redirect_uri: 'http://localhost:5173/auth/callback/github',
      scope: 'read:user user:email',
      flow_version: 2,
    }
    const assign = vi.fn()
    vi.stubGlobal('location', { assign })
    mocks.getOAuthProviders.mockResolvedValue([config])
    mocks.beginOAuthLogin.mockResolvedValue('https://github.com/login/oauth/authorize?state=fresh')
    render(
      <StrictMode>
        <MemoryRouter
          initialEntries={['/auth/callback/github?restart=2&error=upgrade&code=old&state=old']}
        >
          <Routes>
            <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
          </Routes>
        </MemoryRouter>
      </StrictMode>,
    )
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(
      'https://github.com/login/oauth/authorize?state=fresh',
    ))
    expect(mocks.beginOAuthLogin).toHaveBeenCalledExactlyOnceWith(config)
    expect(mocks.oauthCallback).not.toHaveBeenCalled()
    expect(mocks.getMe).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
    expect(mocks.exitDemo).not.toHaveBeenCalled()
  })

  it('keeps restart failures recoverable without changing the current session', async () => {
    mocks.getOAuthProviders.mockRejectedValueOnce(new Error('Sign-in service is updating.'))
    render(
      <MemoryRouter initialEntries={['/auth/callback/google?restart=2&error=upgrade']}>
        <Routes>
          <Route path="/auth/callback/:provider" element={<OAuthCallbackPage />} />
        </Routes>
      </MemoryRouter>,
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('Sign-in service is updating')
    expect(screen.getByRole('button', { name: 'Sign in again' })).toBeEnabled()
    expect(mocks.oauthCallback).not.toHaveBeenCalled()
    expect(mocks.login).not.toHaveBeenCalled()
  })
})
