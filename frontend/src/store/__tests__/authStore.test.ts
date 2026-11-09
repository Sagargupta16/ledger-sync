import { afterEach, describe, expect, it } from 'vitest'

import { DEMO_ACCESS_TOKEN, useAuthStore } from '@/store/authStore'
import type { User } from '@/types'

const STORAGE_KEY = 'ledger-sync-auth'

function user(id: number): User {
  return { id, email: `u${id}@example.test`, full_name: `User ${id}` } as User
}

function stored(): { accessToken?: string; user?: { id: number } } | undefined {
  const raw = localStorage.getItem(STORAGE_KEY)
  return raw ? (JSON.parse(raw) as { state: { accessToken?: string; user?: { id: number } } }).state : undefined
}

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false })
  localStorage.clear()
})

describe('auth persistence', () => {
  it('persists a real sign-in for other tabs and reloads', () => {
    useAuthStore.getState().login(user(7), { access_token: 'a.b.c', refresh_token: 'r.s.t', token_type: 'bearer' })
    expect(stored()).toMatchObject({ accessToken: 'a.b.c', user: { id: 7 } })
  })

  it('never writes a demo session over a real sign-in another tab stored', () => {
    useAuthStore.getState().login(user(7), { access_token: 'a.b.c', refresh_token: 'r.s.t', token_type: 'bearer' })
    const realEntry = localStorage.getItem(STORAGE_KEY)

    useAuthStore.getState().login(user(-1), {
      access_token: DEMO_ACCESS_TOKEN,
      refresh_token: 'demo-refresh',
      token_type: 'bearer',
    })

    expect(useAuthStore.getState().accessToken).toBe(DEMO_ACCESS_TOKEN)
    expect(localStorage.getItem(STORAGE_KEY)).toBe(realEntry)
  })

  it('keeps the other account when the demo session ends', () => {
    useAuthStore.getState().login(user(7), { access_token: 'a.b.c', refresh_token: 'r.s.t', token_type: 'bearer' })
    useAuthStore.getState().login(user(-1), {
      access_token: DEMO_ACCESS_TOKEN,
      refresh_token: 'demo-refresh',
      token_type: 'bearer',
    })

    useAuthStore.getState().logout()

    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(stored()).toMatchObject({ accessToken: 'a.b.c', user: { id: 7 } })
  })
})
