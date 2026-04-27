import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendChat, type ToolSpec } from '../chatAdapters'

const TOOLS: ToolSpec[] = [
  {
    name: 'list_accounts',
    description: 'List accounts',
    parameters: { type: 'object', properties: {} },
  },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn())
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function okJson(data: unknown) {
  return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response)
}

describe('sendChat', () => {
  it('openai: plain text reply', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      okJson({
        choices: [{ finish_reason: 'stop', message: { content: 'Hello' } }],
      }),
    )
    const res = await sendChat('openai', {
      model: 'gpt-4o',
      systemPrompt: 'be helpful',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'k',
      signal: new AbortController().signal,
    })
    expect(res.stopReason).toBe('end_turn')
    expect(res.blocks).toEqual([{ type: 'text', text: 'Hello' }])
  })

  it('openai: tool_calls get converted to tool_use blocks', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      okJson({
        choices: [
          {
            finish_reason: 'tool_calls',
            message: {
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  function: { name: 'list_accounts', arguments: '{}' },
                },
              ],
            },
          },
        ],
      }),
    )
    const res = await sendChat('openai', {
      model: 'gpt-4o',
      systemPrompt: '',
      messages: [{ role: 'user', content: 'how many accounts' }],
      apiKey: 'k',
      tools: TOOLS,
      signal: new AbortController().signal,
    })
    expect(res.stopReason).toBe('tool_use')
    expect(res.blocks).toEqual([
      { type: 'tool_use', tool_use_id: 'call_1', name: 'list_accounts', input: {} },
    ])
  })

  it('anthropic: mixed text + tool_use output', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      okJson({
        content: [
          { type: 'text', text: 'Let me check.' },
          { type: 'tool_use', id: 'tu_1', name: 'list_accounts', input: {} },
        ],
        stop_reason: 'tool_use',
      }),
    )
    const res = await sendChat('anthropic', {
      model: 'claude-sonnet-4-6',
      systemPrompt: '',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'k',
      signal: new AbortController().signal,
    })
    expect(res.stopReason).toBe('tool_use')
    expect(res.blocks).toHaveLength(2)
    expect(res.blocks[0]).toMatchObject({ type: 'text' })
    expect(res.blocks[1]).toMatchObject({ type: 'tool_use', name: 'list_accounts' })
  })

  it('bedrock: response blocks are mapped to internal Block[]', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      okJson({
        blocks: [{ type: 'text', text: 'ack' }],
        stop_reason: 'end_turn',
      }),
    )
    const res = await sendChat('bedrock', {
      model: 'us.anthropic.claude-opus-4-7',
      systemPrompt: '',
      messages: [{ role: 'user', content: 'hi' }],
      apiKey: 'jwt',
      region: 'us-east-1',
      signal: new AbortController().signal,
    })
    expect(res.blocks).toEqual([{ type: 'text', text: 'ack' }])
    // Verify we hit the backend proxy (not AWS directly)
    expect(mock).toHaveBeenCalledWith(
      '/api/ai/bedrock/chat',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('bedrock: tool_result blocks are wrapped in [{json: ...}] for backend', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      okJson({ blocks: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }),
    )
    await sendChat('bedrock', {
      model: 'us.anthropic.claude-opus-4-7',
      systemPrompt: '',
      messages: [
        { role: 'user', content: 'hi' },
        {
          role: 'assistant',
          blocks: [
            { type: 'tool_use', tool_use_id: 't1', name: 'list_accounts', input: {} },
          ],
        },
        {
          role: 'user',
          blocks: [
            {
              type: 'tool_result',
              tool_use_id: 't1',
              content: { accounts: [], count: 0 },
            },
          ],
        },
      ],
      apiKey: 'jwt',
      signal: new AbortController().signal,
    })
    const [, opts] = mock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(opts.body) as {
      messages: { role: string; blocks: Array<{ type: string; content?: unknown }> }[]
    }
    const toolResult = body.messages[2].blocks[0]
    expect(toolResult.type).toBe('tool_result')
    // Bedrock wire format wraps json under content: [{ json: ... }]
    expect(toolResult.content).toEqual([{ json: { accounts: [], count: 0 } }])
  })

  it('surfaces a friendly error when the HTTP response is not ok', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 502,
        json: () => Promise.resolve({ detail: 'Bedrock error: bad model id' }),
      } as unknown as Response),
    )
    await expect(
      sendChat('bedrock', {
        model: 'x',
        systemPrompt: '',
        messages: [{ role: 'user', content: 'hi' }],
        apiKey: 'jwt',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow(/Bedrock error: bad model id/)
  })
})
