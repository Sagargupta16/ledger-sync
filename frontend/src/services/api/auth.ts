/**
 * Authentication API Service
 *
 * OAuth-only authentication. Handles token refresh, user profile,
 * account management, and OAuth provider interactions.
 */

import axios from 'axios'
import { apiClient } from './client'
import { API_BASE_URL } from '@/constants'
import type {
  User,
  AuthTokens,
  OAuthAuthorization,
  OAuthCallbackRequest,
  OAuthProvider,
  OAuthProviderConfig,
} from '@/types'

const AUTH_BASE = '/api/auth'
const OAUTH_ATTEMPT_KEY = 'ledger-sync-oauth-attempt'

// Public OAuth endpoints must remain reachable while the sample workspace is open.
// Keep them independent of authenticated refresh and demo data interceptors.
const oauthClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 20_000,
  withCredentials: false,
  headers: { 'Content-Type': 'application/json' },
})

interface OAuthAttempt {
  provider: OAuthProvider
  state: string
  verifier: string
  expiresAt: number
}

const AUTHORIZE_URLS: Record<OAuthProvider, string> = {
  google: 'https://accounts.google.com/o/oauth2/v2/auth',
  github: 'https://github.com/login/oauth/authorize',
}

function isOAuthProvider(provider: string): provider is OAuthProvider {
  return provider === 'google' || provider === 'github'
}

function isOAuthAttempt(value: unknown): value is OAuthAttempt {
  return typeof value === 'object' && value !== null
    && 'provider' in value && typeof value.provider === 'string' && isOAuthProvider(value.provider)
    && 'state' in value && typeof value.state === 'string'
    && 'verifier' in value && typeof value.verifier === 'string'
    && /^[A-Za-z0-9._~-]{43,128}$/.test(value.verifier)
    && 'expiresAt' in value && typeof value.expiresAt === 'number' && Number.isFinite(value.expiresAt)
}

function validateProviderConfig(config: OAuthProviderConfig): void {
  const redirect = new URL(
    `${import.meta.env.BASE_URL}auth/callback/${config.provider}`,
    globalThis.location.origin,
  ).href
  if (
    config.flow_version !== 2
    || !isOAuthProvider(config.provider)
    || config.authorize_url !== AUTHORIZE_URLS[config.provider]
    || config.redirect_uri !== redirect
  ) {
    throw new Error('The sign-in service returned an invalid provider or callback URL.')
  }
}

function base64Url(bytes: Uint8Array): string {
  return btoa(String.fromCodePoint(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '')
}

function readOAuthAttempt(): OAuthAttempt | null {
  let stored: string | null
  try {
    stored = globalThis.sessionStorage.getItem(OAUTH_ATTEMPT_KEY)
  } catch {
    throw new Error('Sign-in needs session storage in this tab. Enable it and try again.')
  }
  if (!stored) return null
  try {
    const attempt: unknown = JSON.parse(stored)
    return isOAuthAttempt(attempt) ? attempt : null
  } catch {
    return null
  }
}

/**
 * Refresh access token using refresh token
 */
export const refreshToken = async (refreshToken: string): Promise<AuthTokens> => {
  const response = await apiClient.post<AuthTokens>(`${AUTH_BASE}/refresh`, {
    refresh_token: refreshToken,
  })
  return response.data
}

/**
 * Get current user profile
 */
export const getMe = async (accessToken?: string): Promise<User> => {
  // During OAuth, verify the new profile before replacing the current session.
  const response = accessToken
    ? await oauthClient.get<User>(`${AUTH_BASE}/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    : await apiClient.get<User>(`${AUTH_BASE}/me`)
  return response.data
}

/**
 * Logout (client-side token cleanup)
 */
export const logout = async (): Promise<void> => {
  try {
    await apiClient.post(`${AUTH_BASE}/logout`)
  } catch (e) {
    console.warn('[logout] Server logout failed:', e)
  }
}

/**
 * Update user profile.
 *
 * JSON BODY, not query params. `PUT /api/auth/me` declares `updates:
 * UserUpdate`, so sending a null body with `params: { full_name }` was rejected
 * 422 `{"loc": ["body"], "msg": "Field required"}` -- saving a display name in
 * the profile modal could never succeed. Reproduced against the real app at
 * 2026-07-27 and pinned in backend/tests/integration/test_profile_update.py.
 *
 * `/account/reset` below is the genuine query-param case (its handler declares
 * `mode: Annotated[..., Query()]`), so the two are not the same shape by
 * accident.
 */
export const updateProfile = async (fullName: string): Promise<User> => {
  const response = await apiClient.put<User>(`${AUTH_BASE}/me`, { full_name: fullName })
  return response.data
}

/**
 * Delete user account and all data permanently
 * WARNING: This action is irreversible!
 */
export const deleteAccount = async (): Promise<{ message: string }> => {
  const response = await apiClient.delete<{ message: string }>(`${AUTH_BASE}/account`)
  return response.data
}

/**
 * Reset account data (keeps OAuth login).
 * @param mode - "full" clears everything; "transactions" preserves preferences/budgets/goals
 */
export const resetAccount = async (mode: 'full' | 'transactions' = 'full'): Promise<{ message: string }> => {
  const response = await apiClient.post<{ message: string }>(`${AUTH_BASE}/account/reset`, null, {
    params: { mode },
  })
  return response.data
}

/**
 * Get enabled OAuth provider configurations
 */
export const getOAuthProviders = async (): Promise<OAuthProviderConfig[]> => {
  const response = await oauthClient.get<OAuthProviderConfig[]>(`${AUTH_BASE}/oauth/providers`, {
    params: { flow_version: '2' },
  })
  if (response.data.some(provider => provider.flow_version !== 2)) {
    throw new Error('The sign-in service is updating. Refresh this page and try again.')
  }
  return response.data
}

/**
 * Start a provider-specific attempt. Only its public challenge leaves this tab.
 */
export const beginOAuthLogin = async (provider: OAuthProviderConfig): Promise<string> => {
  validateProviderConfig(provider)
  if (!globalThis.crypto?.subtle) {
    throw new Error('Sign-in requires a secure browser connection. Open Ledger Sync using HTTPS.')
  }
  const verifier = base64Url(globalThis.crypto.getRandomValues(new Uint8Array(64)))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  const challenge = base64Url(new Uint8Array(digest))
  const response = await oauthClient.post<OAuthAuthorization>(
    `${AUTH_BASE}/oauth/${provider.provider}/authorize`,
    { code_challenge: challenge },
  )
  const authorization = response.data
  validateProviderConfig(authorization)
  if (
    authorization.provider !== provider.provider
    || authorization.code_challenge !== challenge
    || authorization.code_challenge_method !== 'S256'
    || !authorization.state
    || !Number.isFinite(authorization.expires_in)
    || authorization.expires_in <= 0
    || authorization.expires_in > 600
  ) {
    throw new Error('The sign-in service returned an invalid attempt. Please try again.')
  }

  const attempt: OAuthAttempt = {
    provider: provider.provider,
    state: authorization.state,
    verifier,
    expiresAt: Date.now() + authorization.expires_in * 1000,
  }
  try {
    globalThis.sessionStorage.setItem(OAUTH_ATTEMPT_KEY, JSON.stringify(attempt))
  } catch {
    throw new Error('Sign-in needs session storage in this tab. Enable it and try again.')
  }

  const params = new URLSearchParams({
    client_id: authorization.client_id,
    redirect_uri: authorization.redirect_uri,
    scope: authorization.scope,
    response_type: 'code',
    state: authorization.state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  })
  if (provider.provider === 'google') {
    params.set('access_type', 'offline')
    params.set('prompt', 'consent')
  }
  return `${authorization.authorize_url}?${params.toString()}`
}

/** Discard a cancelled attempt only if it belongs to this tab and provider. */
export const cancelOAuthLogin = (provider: string, state: string): void => {
  const attempt = readOAuthAttempt()
  if (attempt?.provider === provider && attempt.state === state) {
    globalThis.sessionStorage.removeItem(OAUTH_ATTEMPT_KEY)
  }
}

/**
 * Consume the matching browser attempt before exchanging its code and verifier.
 */
export const oauthCallback = async (provider: string, code: string, state?: string): Promise<AuthTokens> => {
  if (!isOAuthProvider(provider) || !code || !state) {
    throw new Error('The sign-in response is incomplete. Please start sign-in again.')
  }
  const attempt = readOAuthAttempt()
  if (!attempt) {
    throw new Error('This sign-in attempt is missing or already used. Start sign-in again in this tab.')
  }
  if (attempt.provider !== provider || attempt.state !== state) {
    throw new Error('This sign-in response does not match this tab. Please start sign-in again.')
  }
  globalThis.sessionStorage.removeItem(OAUTH_ATTEMPT_KEY)
  if (Date.now() >= attempt.expiresAt) {
    throw new Error('This sign-in attempt has expired. Please start sign-in again.')
  }
  const body: OAuthCallbackRequest = {
    code,
    state,
    code_verifier: attempt.verifier,
  }
  const response = await oauthClient.post<AuthTokens>(`${AUTH_BASE}/oauth/${provider}/callback`, body)
  return response.data
}
