/**
 * Tool-calling client glue.
 *
 * The LLM picks tool names + args; this module forwards execution to the
 * backend `/api/ai/tools/execute` endpoint (which enforces user scoping).
 */

import { apiClient } from '@/services/api/client'
import { readableErrorMessage, type ToolSpec } from './chatAdapters'

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

/**
 * The API's own message when it sent one. `detail` is a string for an
 * HTTPException but a list of validation issues for a 422, so the body is read
 * through the chat adapters' shared reader rather than assumed to be a string.
 */
function extractErrorMessage(err: unknown): string {
  const fallback = err instanceof Error ? err.message : 'Unknown error'
  if (err && typeof err === 'object' && 'response' in err) {
    const response = (err as { response?: { data?: unknown } }).response
    return readableErrorMessage(response?.data, fallback)
  }
  return fallback
}
