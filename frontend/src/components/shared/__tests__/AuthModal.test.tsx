import { useState } from 'react'

import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import * as authApi from '@/services/api/auth'
import type { OAuthProviderConfig } from '@/types'

import { AuthModal } from '../AuthModal'

vi.mock('@/services/api/auth', () => ({
  getOAuthProviders: vi.fn(),
}))

const PROVIDERS: OAuthProviderConfig[] = [
  {
    provider: 'google',
    client_id: 'google-client',
    authorize_url: 'https://accounts.google.com/o/oauth2/v2/auth',
    scope: 'openid email profile',
    redirect_uri: 'http://localhost:5173/auth/callback/google',
    state: 'google-state',
  },
  {
    provider: 'github',
    client_id: 'github-client',
    authorize_url: 'https://github.com/login/oauth/authorize',
    scope: 'read:user user:email',
    redirect_uri: 'http://localhost:5173/auth/callback/github',
    state: 'github-state',
  },
]

function AuthModalHarness() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <>
      <button type="button" onClick={() => setIsOpen(true)}>
        Open sign in
      </button>
      <AuthModal isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </>
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('AuthModal', () => {
  it('loads configured providers and keeps keyboard focus inside the dialog', async () => {
    vi.mocked(authApi.getOAuthProviders).mockResolvedValue(PROVIDERS)
    render(<AuthModalHarness />)

    const trigger = screen.getByRole('button', { name: 'Open sign in' })
    trigger.focus()
    fireEvent.click(trigger)

    const dialog = await screen.findByRole('dialog', { name: 'Welcome to Ledger Sync' })
    const close = screen.getByRole('button', { name: 'Close sign-in dialog' })
    const github = await screen.findByRole('button', { name: 'Continue with GitHub' })

    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument()
    expect(close).toHaveFocus()

    github.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(close).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('retries provider loading after a temporary service failure', async () => {
    vi.mocked(authApi.getOAuthProviders)
      .mockRejectedValueOnce(new Error('Service unavailable'))
      .mockResolvedValueOnce(PROVIDERS)
    render(<AuthModalHarness />)

    fireEvent.click(screen.getByRole('button', { name: 'Open sign in' }))

    expect(
      await screen.findByText("Couldn't reach the sign-in service."),
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))

    expect(
      await screen.findByRole('button', { name: 'Continue with Google' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Continue with GitHub' }),
    ).toBeInTheDocument()
    expect(authApi.getOAuthProviders).toHaveBeenCalledTimes(2)
    expect(
      screen.queryByText("Couldn't reach the sign-in service."),
    ).not.toBeInTheDocument()
  })
})
