import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_REQUEST_MESSAGES,
  prepareMessages,
  readableErrorMessage,
  sendChat,
  type ChatMessage,
  type ToolSpec,
} from '../chatAdapters'

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

  it('bedrock: a failed reply placeholder never reaches the request', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      okJson({ blocks: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn' }),
    )
    await sendChat('bedrock', {
      model: 'app-default',
      systemPrompt: '',
      messages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: '' },
        { role: 'user', content: 'second' },
      ],
      apiKey: 'jwt',
      signal: new AbortController().signal,
    })
    const [, opts] = mock.mock.calls[0] as [string, { body: string }]
    const body = JSON.parse(opts.body) as { messages: unknown[] }
    expect(body.messages).toEqual([
      { role: 'user', blocks: [{ type: 'text', text: 'first\n\nsecond' }] },
    ])
  })

  it('surfaces a FastAPI validation array as readable text', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            detail: [
              {
                type: 'value_error',
                loc: ['body'],
                msg: 'Value error, Chat history is too large; start a new conversation',
              },
            ],
          }),
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
    ).rejects.toThrow('The chat request was rejected: Chat history is too large; start a new conversation')
  })

  it('surfaces a SlowAPI 429 body instead of the status code', async () => {
    const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>
    mock.mockReturnValueOnce(
      Promise.resolve({
        ok: false,
        status: 429,
        json: () => Promise.resolve({ error: 'Rate limit exceeded: 30 per 1 minute' }),
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
    ).rejects.toThrow('Rate limit exceeded: 30 per 1 minute')
  })
})

describe('readableErrorMessage', () => {
  it('names the field a validation issue points at', () => {
    const body = {
      detail: [
        { loc: ['body', 'messages', 1, 'content'], msg: 'String should have at least 1 character' },
      ],
    }
    expect(readableErrorMessage(body, 'fallback')).toBe(
      'The chat request was rejected: String should have at least 1 character (messages.1.content)',
    )
  })

  it('reads the OpenAI/Anthropic error message and falls back otherwise', () => {
    expect(readableErrorMessage({ error: { message: 'Invalid API key' } }, 'fallback')).toBe(
      'Invalid API key',
    )
    expect(readableErrorMessage({}, 'Bedrock error 500')).toBe('Bedrock error 500')
  })
})

function toolRound(id: string): ChatMessage[] {
  return [
    { role: 'assistant', blocks: [{ type: 'tool_use', tool_use_id: id, name: 'list_accounts', input: {} }] },
    { role: 'user', blocks: [{ type: 'tool_result', tool_use_id: id, content: { count: 0 } }] },
  ]
}

function longHistory(exchanges: number): ChatMessage[] {
  const history: ChatMessage[] = []
  for (let i = 0; i < exchanges; i++) {
    history.push({ role: 'user', content: `q${i}` }, { role: 'assistant', content: `a${i}` })
  }
  return history
}

describe('prepareMessages', () => {
  it('drops blank text beside a tool_use but keeps the tool_use', () => {
    const [, assistant] = prepareMessages([
      { role: 'user', content: 'accounts?' },
      {
        role: 'assistant',
        blocks: [
          { type: 'text', text: '  ' },
          { type: 'tool_use', tool_use_id: 't1', name: 'list_accounts', input: {} },
        ],
      },
    ])
    expect(assistant.blocks).toEqual([
      { type: 'tool_use', tool_use_id: 't1', name: 'list_accounts', input: {} },
    ])
  })

  it('caps a long conversation and opens it with a user question', () => {
    const prepared = prepareMessages(longHistory(80))
    expect(prepared.length).toBeLessThanOrEqual(MAX_REQUEST_MESSAGES)
    expect(prepared[0]).toEqual({ role: 'user', blocks: [{ type: 'text', text: 'q60' }] })
  })

  it('never cuts between a tool_use and its tool_result', () => {
    const history = [
      ...longHistory(3),
      { role: 'user', content: 'now' } as ChatMessage,
      ...toolRound('t1'),
      ...toolRound('t2'),
    ]
    // A 4-message window would open on t1's tool_use, so the cut moves back to
    // the question that started the tool loop instead.
    const prepared = prepareMessages(history, 4)
    expect(prepared[0]).toEqual({ role: 'user', blocks: [{ type: 'text', text: 'now' }] })
    expect(prepared).toHaveLength(5)
  })
})
