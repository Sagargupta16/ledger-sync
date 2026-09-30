/**
 * Guards the stuck-conversation defect: every send appended an empty assistant
 * placeholder, a failed or stopped reply left it in history, and the next send
 * carried `{type: 'text', text: ''}`, which the Bedrock proxy rejects (422), so
 * every later message failed until the chat was cleared.
 */

import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/chatContext', () => ({
  buildFinancialContext: () => Promise.resolve('system prompt'),
}))
vi.mock('@/lib/chatTools', () => ({
  fetchTools: () => Promise.resolve([]),
  executeTool: () => Promise.resolve({}),
}))

const { useChat } = await import('../useChat')
const { useAuthStore } = await import('@/store/authStore')

const fetchMock = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()

function reply(status: number, body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(body),
  } as Response)
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

function renderChat() {
  return renderHook(() => useChat('app_bedrock', null, null, null), { wrapper })
}

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
  useAuthStore.setState({ accessToken: 'test-token' })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useChat', () => {
  it('drops a failed reply so the next question still sends', async () => {
    fetchMock
      .mockReturnValueOnce(reply(502, { detail: 'Bedrock rejected the request.' }))
      .mockReturnValueOnce(reply(200, { blocks: [{ type: 'text', text: 'Done' }], stop_reason: 'end_turn' }))
    const { result } = renderChat()

    act(() => result.current.send('first'))
    await waitFor(() => expect(result.current.isStreaming).toBe(false))

    expect(result.current.messages).toEqual([{ role: 'user', content: 'first' }])
    expect(result.current.error).toBe('Bedrock rejected the request.')

    act(() => result.current.send('second'))
    await waitFor(() =>
      expect(result.current.messages.at(-1)).toEqual({ role: 'assistant', content: 'Done' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { messages: unknown[] }
    expect(body.messages).toEqual([
      { role: 'user', blocks: [{ type: 'text', text: 'first\n\nsecond' }] },
    ])
  })

  it('stop removes the pending reply without an error', async () => {
    fetchMock.mockImplementationOnce(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () =>
            reject(new DOMException('Aborted', 'AbortError')),
          )
        }),
    )
    const { result } = renderChat()

    act(() => result.current.send('slow question'))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    act(() => result.current.stop())

    expect(result.current.messages).toEqual([{ role: 'user', content: 'slow question' }])
    expect(result.current.isStreaming).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('reports an empty final reply instead of leaving a loading bubble', async () => {
    fetchMock.mockReturnValueOnce(
      reply(200, { blocks: [{ type: 'text', text: '  ' }], stop_reason: 'end_turn' }),
    )
    const { result } = renderChat()

    act(() => result.current.send('hello'))
    await waitFor(() => expect(result.current.isStreaming).toBe(false))

    expect(result.current.messages).toEqual([{ role: 'user', content: 'hello' }])
    expect(result.current.error).toMatch(/empty reply/)
  })
})
