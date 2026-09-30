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

import { API_BASE_URL } from '@/constants'

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

export interface UsageInfo {
  inputTokens: number
  outputTokens: number
}

export interface ChatResponse {
  blocks: Block[]
  stopReason: StopReason
  /**
   * Per-round token usage reported by the provider. `null` when the provider
   * didn't return usage info (older OpenAI endpoints, some error paths).
   * For Bedrock, usage is logged server-side and not re-reported here.
   */
  usage: UsageInfo | null
}

// --- Small helpers -----------------------------------------------------------

function messageBlocks(msg: ChatMessage): Block[] {
  if (msg.blocks) return msg.blocks
  return [{ type: 'text', text: msg.content ?? '' }]
}

/**
 * Most messages one request carries. The Bedrock proxy rejects more than 100;
 * this stays well under it with a full tool loop in flight and keeps token use
 * bounded for the browser-direct providers too.
 */
export const MAX_REQUEST_MESSAGES = 40

function isBlankText(block: Block): boolean {
  return block.type === 'text' && block.text.trim() === ''
}

/** A user turn asking something, as opposed to one carrying tool results. */
function isQuestion(msg: ChatMessage): boolean {
  return msg.role === 'user' && !(msg.blocks ?? []).some((b) => b.type === 'tool_result')
}

/** Append `next` to `prev`, joining adjacent text so the merged turn stays readable. */
function mergeBlocks(prev: Block[], next: Block[]): Block[] {
  const last = prev.at(-1)
  const [first, ...rest] = next
  if (last?.type === 'text' && first?.type === 'text') {
    return [...prev.slice(0, -1), { type: 'text', text: `${last.text}\n\n${first.text}` }, ...rest]
  }
  return [...prev, ...next]
}

/**
 * Make a UI conversation safe to send to every provider:
 * - drop blank text blocks and any turn left empty (a stopped or failed reply);
 * - merge consecutive same-role turns (a question whose reply failed followed
 *   by the next question), since Bedrock requires alternating roles;
 * - keep the most recent `maxMessages`, cutting only in front of a question so
 *   no tool_use is separated from its tool_result and the request still opens
 *   with a user turn.
 */
export function prepareMessages(
  messages: readonly ChatMessage[],
  maxMessages = MAX_REQUEST_MESSAGES,
): ChatMessage[] {
  const cleaned: ChatMessage[] = []
  for (const msg of messages) {
    const blocks = messageBlocks(msg).filter((b) => !isBlankText(b))
    if (blocks.length === 0) continue
    const prev = cleaned.at(-1)
    if (prev?.role === msg.role) {
      cleaned[cleaned.length - 1] = { role: msg.role, blocks: mergeBlocks(prev.blocks ?? [], blocks) }
    } else {
      cleaned.push({ role: msg.role, blocks })
    }
  }
  let start = Math.max(0, cleaned.length - maxMessages)
  while (start < cleaned.length && !isQuestion(cleaned[start])) start++
  if (start === cleaned.length) start = Math.max(0, cleaned.findLastIndex(isQuestion))
  return cleaned.slice(start)
}

/**
 * Read an error body without trusting it. `res.json()` is typed `any`, so the
 * parsed value is kept at `unknown` and only narrowed by `readableErrorMessage`.
 * A non-JSON body resolves to `{}`.
 */
async function readErrorBody(res: Response): Promise<unknown> {
  return res.json().catch((): unknown => ({}))
}

function describeValidationIssue(issue: unknown): string {
  if (!issue || typeof issue !== 'object') return ''
  const { msg, loc } = issue as { msg?: unknown; loc?: unknown }
  if (typeof msg !== 'string') return ''
  const text = msg.replace(/^Value error, /, '')
  const path = Array.isArray(loc) ? loc.filter((part) => part !== 'body').join('.') : ''
  return path ? `${text} (${path})` : text
}

/**
 * One readable sentence from an error body: a FastAPI `detail` string, a
 * FastAPI validation array (`detail: [{loc, msg}]`), SlowAPI's
 * `{error: "Rate limit exceeded: ..."}`, or the OpenAI/Anthropic
 * `{error: {message}}` shape. Anything else yields `fallback`.
 */
export function readableErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback
  const { detail, error } = body as { detail?: unknown; error?: unknown }
  if (typeof detail === 'string' && detail) return detail
  if (Array.isArray(detail)) {
    const issues = detail.map(describeValidationIssue).filter(Boolean)
    if (issues.length > 0) return `The chat request was rejected: ${issues.slice(0, 2).join('; ')}`
  }
  if (typeof error === 'string' && error) return error
  const message = error && typeof error === 'object' ? (error as { message?: unknown }).message : null
  if (typeof message === 'string' && message) return message
  return fallback
}

async function responseError(res: Response, provider: string): Promise<Error> {
  return new Error(readableErrorMessage(await readErrorBody(res), `${provider} error ${res.status}`))
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

// OpenAI reasoning models (o1/o3/o4...) reject `max_tokens` and require
// `max_completion_tokens`. Match the leading "o<digit>" family.
const OPENAI_REASONING_MODEL = /^o\d/i

async function callOpenAI(params: SendParams): Promise<ChatResponse> {
  const tokenLimit = 1024
  const isReasoning = OPENAI_REASONING_MODEL.test(params.model)
  const body = {
    model: params.model,
    ...(isReasoning ? { max_completion_tokens: tokenLimit } : { max_tokens: tokenLimit }),
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
  if (!res.ok) throw await responseError(res, 'OpenAI')
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
    usage?: {
      prompt_tokens?: number
      completion_tokens?: number
    }
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
  const usage: UsageInfo | null = data.usage
    ? {
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
      }
    : null
  return { blocks, stopReason: normaliseStopReason(choice?.finish_reason), usage }
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
  if (!res.ok) throw await responseError(res, 'Anthropic')
  const data = (await res.json()) as {
    content?: AnthropicContentBlock[]
    stop_reason?: string | null
    usage?: {
      input_tokens?: number
      output_tokens?: number
    }
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
  const usage: UsageInfo | null = data.usage
    ? {
        inputTokens: data.usage.input_tokens ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
      }
    : null
  return { blocks, stopReason: normaliseStopReason(data.stop_reason), usage }
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
  // MUST be absolute against the backend host: a relative /api path resolves
  // to GitHub Pages in production, whose static host answers POST with 405.
  const res = await fetch(`${API_BASE_URL}/api/ai/bedrock/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: params.signal,
  })
  if (!res.ok) throw await responseError(res, 'Bedrock')
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
  // Bedrock usage is logged server-side in ai_chat.py -- return `null` here
  // so useChat knows not to double-log via /api/ai/usage/log.
  return { blocks, stopReason: normaliseStopReason(data.stop_reason), usage: null }
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
  return adapter({ ...params, messages: prepareMessages(params.messages) })
}
