export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface BuildParams {
  model: string
  systemPrompt: string
  messages: ChatMessage[]
  region?: string
}

interface StreamParams extends BuildParams {
  apiKey: string
  onToken: (token: string) => void
  onDone: () => void
  onError: (error: string) => void
  signal: AbortSignal
}

export function buildOpenAIRequest(params: BuildParams) {
  return {
    url: 'https://api.openai.com/v1/chat/completions',
    headers: { 'Content-Type': 'application/json' },
    body: {
      model: params.model,
      stream: true,
      messages: [{ role: 'system', content: params.systemPrompt }, ...params.messages],
    },
  }
}

export function buildAnthropicRequest(params: BuildParams) {
  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: {
      model: params.model,
      max_tokens: 1024,
      system: params.systemPrompt,
      stream: true,
      messages: params.messages.map((m) => ({ role: m.role, content: m.content })),
    },
  }
}

export function buildBedrockRequest(params: BuildParams) {
  const region = params.region ?? 'us-east-1'
  return {
    url: `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(params.model)}/converse-stream`,
    headers: { 'Content-Type': 'application/json' },
    body: {
      messages: params.messages.map((m) => ({
        role: m.role,
        content: [{ text: m.content }],
      })),
      system: [{ text: params.systemPrompt }],
      inferenceConfig: { maxTokens: 1024 },
    },
  }
}

async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  extractToken: (json: Record<string, unknown>) => string | undefined,
  onToken: (token: string) => void,
) {
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data: ') || trimmed === 'data: [DONE]') continue
      try {
        const json = JSON.parse(trimmed.slice(6))
        const token = extractToken(json)
        if (token) onToken(token)
      } catch {
        // skip malformed JSON
      }
    }
  }
}

async function streamOpenAI(params: StreamParams) {
  const req = buildOpenAIRequest(params)
  const response = await fetch(req.url, {
    method: 'POST',
    headers: { ...req.headers, Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify(req.body),
    signal: params.signal,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `OpenAI error ${response.status}`)
  }
  await parseSSEStream(
    response.body!.getReader(),
    (json) => (json as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content,
    params.onToken,
  )
  params.onDone()
}

async function streamAnthropic(params: StreamParams) {
  const req = buildAnthropicRequest(params)
  const response = await fetch(req.url, {
    method: 'POST',
    headers: { ...req.headers, 'x-api-key': params.apiKey },
    body: JSON.stringify(req.body),
    signal: params.signal,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.error?.message ?? `Anthropic error ${response.status}`)
  }
  await parseSSEStream(
    response.body!.getReader(),
    (json) => {
      if ((json as { type?: string }).type === 'content_block_delta') {
        return (json as { delta?: { text?: string } }).delta?.text
      }
      return undefined
    },
    params.onToken,
  )
  params.onDone()
}

async function streamBedrock(params: StreamParams) {
  const req = buildBedrockRequest(params)
  const response = await fetch(req.url, {
    method: 'POST',
    headers: { ...req.headers, Authorization: `Bearer ${params.apiKey}` },
    body: JSON.stringify(req.body),
    signal: params.signal,
  })
  if (!response.ok) {
    const err = await response.json().catch(() => ({}))
    throw new Error(err.message ?? `Bedrock error ${response.status}`)
  }
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop()!
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      try {
        const json = JSON.parse(trimmed)
        const token = (json as { contentBlockDelta?: { delta?: { text?: string } } })
          .contentBlockDelta?.delta?.text
        if (token) params.onToken(token)
      } catch {
        // skip
      }
    }
  }
  params.onDone()
}

const adapters: Record<string, (params: StreamParams) => Promise<void>> = {
  openai: streamOpenAI,
  anthropic: streamAnthropic,
  bedrock: streamBedrock,
}

export async function streamChat(provider: string, params: StreamParams) {
  const adapter = adapters[provider]
  if (!adapter) throw new Error(`Unknown provider: ${provider}`)
  try {
    await adapter(params)
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    const message = err instanceof Error ? err.message : 'Unknown streaming error'
    params.onError(message)
  }
}
