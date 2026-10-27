import { API_BASE_URL } from '@/constants'

import { apiClient } from './client'

/**
 * The one thing a token may do. `mmbak:upload` posts Money Manager backups to
 * `POST /api/upload/money-manager`; `ledger:read` calls the read-only ledger
 * tools over MCP at `POST /mcp`; `alerts:ingest` posts bank-alert text to
 * `POST /api/ingest/text`. No token can sign in or reach any other route.
 */
export type TokenScope = 'mmbak:upload' | 'ledger:read' | 'alerts:ingest'

export const UPLOAD_SCOPE: TokenScope = 'mmbak:upload'
export const LEDGER_READ_SCOPE: TokenScope = 'ledger:read'
export const ALERTS_INGEST_SCOPE: TokenScope = 'alerts:ingest'

/**
 * A long-lived credential for an automation or MCP client that cannot run the
 * OAuth sign-in, such as an iPhone Shortcut or Claude Code.
 */
export interface UploadToken {
  id: number
  name: string
  scope: TokenScope
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

/** The backend refuses a sixth active token of the same scope with 409. */
export const MAX_UPLOAD_TOKENS = 5

/** Vite proxies only `/api` (vite.config.ts), so a local MCP client calls the backend itself. */
const DEV_BACKEND_ORIGIN = 'http://localhost:8000'

/**
 * The absolute URL a Shortcut posts to. `API_BASE_URL` is empty in local
 * development, where Vite proxies `/api` on the page's own origin.
 */
export function moneyManagerUploadUrl(): string {
  return `${API_BASE_URL || globalThis.location.origin}/api/upload/money-manager`
}

/** The MCP endpoint, on the backend's origin rather than the page's. */
export function mcpServerUrl(): string {
  const origin = API_BASE_URL || (import.meta.env.DEV ? DEV_BACKEND_ORIGIN : globalThis.location.origin)
  return `${origin}/mcp`
}

/** The one-line Claude Code setup for a `ledger:read` token. */
export function claudeMcpAddCommand(token: string): string {
  return `claude mcp add --transport http ledger-sync ${mcpServerUrl()} --header "Authorization: Bearer ${token}"`
}

export const uploadTokensService = {
  /** Active tokens of every scope; revoked and expired ones are not listed. */
  listTokens: async (): Promise<UploadToken[]> => {
    const response = await apiClient.get<{ tokens: UploadToken[] }>('/api/upload-tokens')
    return response.data.tokens
  },

  createToken: async (name: string, scope: TokenScope): Promise<CreatedUploadToken> => {
    const response = await apiClient.post<CreatedUploadToken>('/api/upload-tokens', { name, scope })
    return response.data
  },

  revokeToken: async (id: number): Promise<void> => {
    await apiClient.delete(`/api/upload-tokens/${id}`)
  },
}
