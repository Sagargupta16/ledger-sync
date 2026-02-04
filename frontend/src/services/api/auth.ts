/**
 * Authentication API Service
 *
 * Handles all authentication-related API calls
 */

import { apiClient } from './client'
import type { User, AuthTokens, LoginCredentials, RegisterCredentials } from '@/types'

const AUTH_BASE = '/api/auth'

export interface RefreshTokenRequest {
  refresh_token: string
}

/**
 * Register a new user
 */
export const register = async (credentials: RegisterCredentials): Promise<AuthTokens> => {
  const response = await apiClient.post<AuthTokens>(`${AUTH_BASE}/register`, credentials)
  return response.data
}

/**
 * Login with email and password
 */
export const login = async (credentials: LoginCredentials): Promise<AuthTokens> => {
  const response = await apiClient.post<AuthTokens>(`${AUTH_BASE}/login`, credentials)
  return response.data
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
  } catch {
    // Ignore errors - logout should always succeed client-side
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
 * Reset account to fresh state (keeps credentials, removes all data)
 */
export const resetAccount = async (): Promise<{ message: string }> => {
  const response = await apiClient.post<{ message: string }>(`${AUTH_BASE}/account/reset`)
  return response.data
}
