import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AuthTokens, User } from '@/types'

import OAuthCallbackPage from '../OAuthCallbackPage'

const mocks = vi.hoisted(() => ({
  exitDemo: vi.fn(),
  getMe: vi.fn(),
  login: vi.fn(),
  oauthCallback: vi.fn(),
  prefetchCoreData: vi.fn(),
  setTokens: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock('@/services/api/auth', () => ({
  getMe: mocks.getMe,
  oauthCallback: mocks.oauthCallback,
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
    expect(mocks.setTokens).toHaveBeenCalledWith(TOKENS)
    expect(mocks.getMe).toHaveBeenCalledOnce()
    expect(mocks.login).toHaveBeenCalledWith(USER, TOKENS)
    expect(mocks.prefetchCoreData).toHaveBeenCalledOnce()
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Signed in successfully!')

    await waitFor(() => expect(mocks.toastError).not.toHaveBeenCalled())
  })
})
