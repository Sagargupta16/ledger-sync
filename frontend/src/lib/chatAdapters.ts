/**
 * Provider-neutral chat adapters with tool-calling support.
 *
 * All three providers (OpenAI, Anthropic, Bedrock) are non-streaming in this
 * iteration. The user waits 2-5s for a full reply instead of seeing tokens
 * arrive; this keeps the tool-calling loop simple (one request per "turn"
 * rather than parsing tool_use events out of a live SSE stream).
 *
 * Message shape:
 *   { role, blocks: Block[] }  -- where a Block is text, tool_use, or
 *   tool_result. A "simple" text-only message can pass a string as
 *   `content` and the adapters wrap it into a single text block.
 */

// --- Public types ------------------------------------------------------------

export type Block =
  | { type: 'text'; text: string }
  | {
      type: 'tool_use'
      tool_use_id: string
      name: string
      input: Record<string, unknown>
    }
  | {
      type: 'tool_result'
      tool_use_id: string
      // JSON-serialisable result -- displayed by provider as a string
      content: unknown
    }

export interface ChatMessage {
  role: 'user' | 'assistant'
  /** Simple text content OR structured blocks. Never both. */
  content?: string
  blocks?: Block[]
}

export interface ToolSpec {
  name: string
  description: string
  parameters: Record<string, unknown> // JSON Schema
}

export interface SendParams {
  model: string
  systemPrompt: string
  messages: ChatMessage[]
  apiKey: string
  region?: string
  tools?: ToolSpec[]
  signal: AbortSignal
}

export type StopReason = 'end_turn' | 'tool_use' | 'max_tokens' | 'other'

export interface ChatResponse {
  blocks: Block[]
  stopReason: StopReason
}

// --- Small helpers -----------------------------------------------------------

function messageBlocks(msg: ChatMessage): Block[] {
  if (msg.blocks) return msg.blocks
  return [{ type: 'text', text: msg.content ?? '' }]
}

function normaliseStopReason(raw: string | null | undefined): StopReason {
  if (raw === 'tool_use' || raw === 'tool_calls') return 'tool_use'
  if (raw === 'end_turn' || raw === 'stop') return 'end_turn'
  if (raw === 'max_tokens' || raw === 'length') return 'max_tokens'
  return 'other'
}

// --- OpenAI ------------------------------------------------------------------

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_calls?: Array<{
    id: string
    type: 'function'
    function: { name: string; arguments: string }
  }>
  tool_call_id?: string
  name?: string
}

function toOpenAIMessages(system: string, messages: ChatMessage[]): OpenAIMessage[] {
  const out: OpenAIMessage[] = [{ role: 'system', content: system }]
  for (const m of messages) {
    const blocks = messageBlocks(m)
    // If this assistant turn is a tool_use, OpenAI expects `tool_calls` not `content`.
    if (m.role === 'assistant' && blocks.some((b) => b.type === 'tool_use')) {
      const toolUses = blocks.filter((b): b is Extract<Block, { type: 'tool_use' }> => b.type === 'tool_use')
      const text = blocks
        .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
        .map((b) => b.text)
        .join('')
      out.push({
        role: 'assistant',
        content: text || null,
        tool_calls: toolUses.map((tu) => ({
          id: tu.tool_use_id,
          type: 'function',
          function: { name: tu.name, arguments: JSON.stringify(tu.input) },
        })),
      })
      continue
    }
    // User messages that carry tool_result blocks -> emit each as a tool message.
    if (m.role === 'user' && blocks.some((b) => b.type === 'tool_result')) {
      for (const b of blocks) {
        if (b.type === 'tool_result') {
          out.push({
            role: 'tool',
            tool_call_id: b.tool_use_id,
            content: JSON.stringify(b.content),
          })
        }
      }
      continue
    }
    // Plain text
    const text = blocks
      .filter((b): b is Extract<Block, { type: 'text' }> => b.type === 'text')
      .map((b) => b.text)
      .join('')
    out.push({ role: m.role, content: text })
  }
  return out
}

async function callOpenAI(params: SendParams): Promise<ChatResponse> {
  const body = {
    model: params.model,
    max_tokens: 1024,
    messages: toOpenAIMessages(params.systemPrompt, params.messages),
    tools: params.tools?.map((t) => ({
      type: 'function' as const,
      function: { name: t.name, description: t.description, parameters: t.parameters },
    })),
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const message = (err as { error?: { message?: string } }).error?.message
    throw new Error(message ?? `OpenAI error ${res.status}`)
  }
  const data = (await res.json()) as {
    choices?: Array<{
      finish_reason?: string | null
      message?: {
        content?: string | null
        tool_calls?: Array<{
          id: string
          function: { name: string; arguments: string }
        }>
      }
    }>
  }
  const choice = data.choices?.[0]
  const blocks: Block[] = []
  if (choice?.message?.content) {
    blocks.push({ type: 'text', text: choice.message.content })
  }
  for (const tc of choice?.message?.tool_calls ?? []) {
    let input: Record<string, unknown> = {}
    try {
      input = JSON.parse(tc.function.arguments) as Record<string, unknown>
    } catch {
      // malformed args -- surface as empty so the tool will fail with a clear error
    }
    blocks.push({
      type: 'tool_use',
      tool_use_id: tc.id,
      name: tc.function.name,
      input,
    })
  }
  return { blocks, stopReason: normaliseStopReason(choice?.finish_reason) }
}

// --- Anthropic ---------------------------------------------------------------

interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  id?: string
  name?: string
  input?: unknown
  tool_use_id?: string
  content?: unknown
}

function toAnthropicBlocks(blocks: Block[]): AnthropicContentBlock[] {
  return blocks.map((b) => {
    if (b.type === 'text') return { type: 'text', text: b.text }
    if (b.type === 'tool_use') {
      return { type: 'tool_use', id: b.tool_use_id, name: b.name, input: b.input }
    }
    return {
      type: 'tool_result',
      tool_use_id: b.tool_use_id,
      content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content),
    }
  })
}

async function callAnthropic(params: SendParams): Promise<ChatResponse> {
  const body = {
    model: params.model,
    max_tokens: 1024,
    system: params.systemPrompt,
    messages: params.messages.map((m) => ({
      role: m.role,
      content: toAnthropicBlocks(messageBlocks(m)),
    })),
    tools: params.tools?.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
    })),
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
      'x-api-key': params.apiKey,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const message = (err as { error?: { message?: string } }).error?.message
    throw new Error(message ?? `Anthropic error ${res.status}`)
  }
  const data = (await res.json()) as {
    content?: AnthropicContentBlock[]
    stop_reason?: string | null
  }
  const blocks: Block[] = []
  for (const b of data.content ?? []) {
    if (b.type === 'text' && typeof b.text === 'string') {
      blocks.push({ type: 'text', text: b.text })
    } else if (b.type === 'tool_use' && b.id && b.name) {
      blocks.push({
        type: 'tool_use',
        tool_use_id: b.id,
        name: b.name,
        input: (b.input ?? {}) as Record<string, unknown>,
      })
    }
  }
  return { blocks, stopReason: normaliseStopReason(data.stop_reason) }
}

// --- Bedrock -----------------------------------------------------------------

interface BedrockWireBlock {
  type: 'text' | 'tool_use' | 'tool_result'
  text?: string
  tool_use_id?: string
  name?: string
  input?: unknown
  content?: unknown
}

function toBedrockWireMessage(msg: ChatMessage): { role: string; blocks: BedrockWireBlock[] } {
  const blocks = messageBlocks(msg).map((b): BedrockWireBlock => {
    if (b.type === 'text') return { type: 'text', text: b.text }
    if (b.type === 'tool_use') {
      return { type: 'tool_use', tool_use_id: b.tool_use_id, name: b.name, input: b.input }
    }
    // Bedrock's toolResult expects `content: [{ json: ... }]` (array of blocks).
    const jsonPayload = typeof b.content === 'string' ? { text: b.content } : { json: b.content }
    return { type: 'tool_result', tool_use_id: b.tool_use_id, content: [jsonPayload] }
  })
  return { role: msg.role, blocks }
}

async function callBedrock(params: SendParams): Promise<ChatResponse> {
  const body = {
    system_prompt: params.systemPrompt,
    max_tokens: 1024,
    messages: params.messages.map(toBedrockWireMessage),
    tools: params.tools,
  }
  const res = await fetch('/api/ai/bedrock/chat', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { detail?: string }).detail ?? `Bedrock error ${res.status}`)
  }
  const data = (await res.json()) as {
    blocks?: BedrockWireBlock[]
    stop_reason?: string | null
  }
  const blocks: Block[] = []
  for (const b of data.blocks ?? []) {
    if (b.type === 'text' && typeof b.text === 'string') {
      blocks.push({ type: 'text', text: b.text })
    } else if (b.type === 'tool_use' && b.tool_use_id && b.name) {
      blocks.push({
        type: 'tool_use',
        tool_use_id: b.tool_use_id,
        name: b.name,
        input: (b.input ?? {}) as Record<string, unknown>,
      })
    }
  }
  return { blocks, stopReason: normaliseStopReason(data.stop_reason) }
}

// --- Public API --------------------------------------------------------------

const adapters: Record<string, (params: SendParams) => Promise<ChatResponse>> = {
  openai: callOpenAI,
  anthropic: callAnthropic,
  bedrock: callBedrock,
}

export async function sendChat(provider: string, params: SendParams): Promise<ChatResponse> {
  const adapter = adapters[provider]
  if (!adapter) throw new Error(`Unknown provider: ${provider}`)
  return adapter(params)
}
