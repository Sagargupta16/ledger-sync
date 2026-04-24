import { describe, it, expect } from 'vitest'
import { buildOpenAIRequest, buildAnthropicRequest, buildBedrockRequest } from '../chatAdapters'

describe('buildOpenAIRequest', () => {
  it('formats messages and sets stream flag', () => {
    const req = buildOpenAIRequest({
      model: 'gpt-4o',
      systemPrompt: 'You are helpful.',
      messages: [{ role: 'user', content: 'Hello' }],
    })
    expect(req.body.model).toBe('gpt-4o')
    expect(req.body.stream).toBe(true)
    expect(req.body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' })
    expect(req.body.messages[1]).toEqual({ role: 'user', content: 'Hello' })
  })
})

describe('buildAnthropicRequest', () => {
  it('uses system field and anthropic headers', () => {
    const req = buildAnthropicRequest({
      model: 'claude-sonnet-4-5-20250514',
      systemPrompt: 'Finance bot.',
      messages: [{ role: 'user', content: 'Hi' }],
    })
    expect(req.body.system).toBe('Finance bot.')
    expect(req.body.stream).toBe(true)
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    expect(req.headers['anthropic-dangerous-direct-browser-access']).toBe('true')
  })
})

describe('buildBedrockRequest', () => {
  it('formats for backend Bedrock proxy', () => {
    const req = buildBedrockRequest({
      model: 'us.anthropic.claude-sonnet-4-6-v1',
      systemPrompt: 'Finance.',
      messages: [{ role: 'user', content: 'Test' }],
      region: 'us-east-1',
    })
    expect(req.url).toBe('/api/ai/bedrock/chat')
    expect(req.body.system_prompt).toBe('Finance.')
    expect(req.body.messages[0]).toEqual({ role: 'user', content: 'Test' })
  })
})
