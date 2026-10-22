import { API_BASE_URL } from '@/constants'

import { apiClient } from './client'

/**
 * A long-lived, upload-only credential for an automation that cannot run the
 * OAuth sign-in, such as an iPhone Shortcut. It can only post a Money Manager
 * backup to `POST /api/upload/money-manager`; it cannot read any data.
 */
export interface UploadToken {
  id: number
  name: string
  /** The first characters of the secret, e.g. `lsu_ab12cd34`, to tell tokens apart. */
  prefix: string
  created_at: string
  expires_at: string
  last_used_at: string | null
}

/** The create response: the only time the server returns the plaintext `token`. */
export interface CreatedUploadToken extends Omit<UploadToken, 'last_used_at'> {
  token: string
}

/** The backend refuses a sixth active token with 409. */
export const MAX_UPLOAD_TOKENS = 5

/**
 * The absolute URL a Shortcut posts to. `API_BASE_URL` is empty in local
 * development, where Vite proxies `/api` on the page's own origin.
 */
export function moneyManagerUploadUrl(): string {
  return `${API_BASE_URL || globalThis.location.origin}/api/upload/money-manager`
}

export const uploadTokensService = {
  /** Active tokens only; revoked and expired ones are not listed. */
  listTokens: async (): Promise<UploadToken[]> => {
    const response = await apiClient.get<{ tokens: UploadToken[] }>('/api/upload-tokens')
    return response.data.tokens
  },

  createToken: async (name: string): Promise<CreatedUploadToken> => {
    const response = await apiClient.post<CreatedUploadToken>('/api/upload-tokens', { name })
    return response.data
  },

  revokeToken: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/upload-tokens/${id}`)
  },
}
