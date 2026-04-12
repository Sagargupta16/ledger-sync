/**
 * Authentication API Service
 *
 * OAuth-only authentication. Handles token refresh, user profile,
 * account management, and OAuth provider interactions.
 */

import { apiClient } from './client'
import type { User, AuthTokens, OAuthProviderConfig } from '@/types'

const AUTH_BASE = '/api/auth'

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
export const getMe = async (): Promise<User> => {
  const response = await apiClient.get<User>(`${AUTH_BASE}/me`)
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
 * Update user profile
 */
export const updateProfile = async (fullName: string): Promise<User> => {
  const response = await apiClient.put<User>(`${AUTH_BASE}/me`, null, {
    params: { full_name: fullName },
  })
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
  const response = await apiClient.get<OAuthProviderConfig[]>(`${AUTH_BASE}/oauth/providers`)
  return response.data
}

/**
 * Exchange OAuth authorization code for JWT tokens
 */
export const oauthCallback = async (provider: string, code: string, state?: string): Promise<AuthTokens> => {
  const response = await apiClient.post<AuthTokens>(`${AUTH_BASE}/oauth/${provider}/callback`, {
    code,
    state,
  })
  return response.data
}
