/**
 * Tool-calling client glue.
 *
 * The LLM picks tool names + args; this module forwards execution to the
 * backend `/api/ai/tools/execute` endpoint (which enforces user scoping).
 */

import { apiClient } from '@/services/api/client'
import type { ToolSpec } from './chatAdapters'

interface ToolsListResponse {
  tools: ToolSpec[]
}

interface ToolExecuteResponse {
  name: string
  result: unknown
}

/**
 * Fetch the list of tools the backend exposes. Cached by TanStack Query at
 * the call-site in `useChat`; this function just talks to the API.
 */
export async function fetchTools(): Promise<ToolSpec[]> {
  const res = await apiClient.get<ToolsListResponse>('/api/ai/tools')
  return res.data.tools
}

/**
 * Execute a tool against the server. Errors are surfaced to the LLM as a
 * tool_result with an `error` key so the model can retry with fixed args
 * rather than failing the whole conversation.
 */
export async function executeTool(
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  try {
    const res = await apiClient.post<ToolExecuteResponse>(
      '/api/ai/tools/execute',
      { name, arguments: args },
    )
    return res.data.result
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    return { error: message }
  }
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: { detail?: string } } }).response
    if (response?.data?.detail) return response.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Unknown error'
}
