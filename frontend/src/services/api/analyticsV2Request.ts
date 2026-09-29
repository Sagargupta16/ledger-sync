/**
 * Shared request helper for the Analytics V2 service modules.
 */

import { apiClient } from './client'

// All V2 list endpoints wrap data in { data: T[], count: number, ... }
interface WrappedResponse<T> {
  data: T[]
  count: number
}

/**
 * GET a V2 list endpoint and unwrap the `{ data, count }` envelope down to
 * the bare `T[]`. Every list endpoint shares this shape, so this keeps the
 * unwrap in one place instead of repeating `response.data.data` per method.
 */
export async function getWrapped<T>(url: string, params?: Record<string, unknown>): Promise<T[]> {
  const response = await apiClient.get<WrappedResponse<T>>(url, { params })
  return response.data.data
}
