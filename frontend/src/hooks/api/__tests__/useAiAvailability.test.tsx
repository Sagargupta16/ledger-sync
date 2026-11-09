import type { ReactNode } from 'react'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { AIConfig } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

import { useAiAvailability } from '../useAiAvailability'

const getConfig = vi.hoisted(() => vi.fn<() => Promise<AIConfig>>())

vi.mock('@/services/api/aiConfig', () => ({
  aiConfigService: { getConfig },
}))

function config(overrides: Partial<AIConfig>): AIConfig {
  return {
    mode: 'app_bedrock',
    provider: null,
    model: null,
    has_key: false,
    region: null,
    daily_token_limit: null,
    monthly_token_limit: null,
    ...overrides,
  }
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

beforeEach(() => {
  getConfig.mockReset()
  useAuthStore.setState({ accessToken: 'test-token' })
  useDemoStore.setState({ isDemoMode: false })
})

describe('useAiAvailability', () => {
  it('is loading until the config arrives, never app mode', () => {
    getConfig.mockReturnValue(new Promise(() => undefined))
    const { result } = renderHook(() => useAiAvailability(), { wrapper })
    expect(result.current).toEqual({ kind: 'loading' })
  })

  it('reports an error with a retry that refetches', async () => {
    getConfig.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(config({}))
    const { result } = renderHook(() => useAiAvailability(), { wrapper })
    await waitFor(() => expect(result.current.kind).toBe('error'))
    if (result.current.kind !== 'error') throw new Error('unreachable')
    result.current.retry()
    await waitFor(() => expect(result.current.kind).toBe('app'))
  })

  it('is demo in demo mode without fetching', () => {
    useDemoStore.setState({ isDemoMode: true })
    const { result } = renderHook(() => useAiAvailability(), { wrapper })
    expect(result.current).toEqual({ kind: 'demo' })
    expect(getConfig).not.toHaveBeenCalled()
  })

  it('is app for app_bedrock', async () => {
    getConfig.mockResolvedValue(config({ mode: 'app_bedrock' }))
    const { result } = renderHook(() => useAiAvailability(), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ kind: 'app' }))
  })

  it('needs a key for byok without one', async () => {
    getConfig.mockResolvedValue(config({ mode: 'byok', provider: 'openai', model: 'gpt', has_key: false }))
    const { result } = renderHook(() => useAiAvailability(), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ kind: 'byok_needs_key' }))
  })

  it('is incomplete for byok with a key but no model', async () => {
    getConfig.mockResolvedValue(config({ mode: 'byok', provider: 'openai', model: null, has_key: true }))
    const { result } = renderHook(() => useAiAvailability(), { wrapper })
    await waitFor(() => expect(result.current).toEqual({ kind: 'byok_incomplete' }))
  })

  it('is ready for byok with key, provider and model', async () => {
    getConfig.mockResolvedValue(
      config({ mode: 'byok', provider: 'anthropic', model: 'claude', has_key: true, region: 'us-east-1' }),
    )
    const { result } = renderHook(() => useAiAvailability(), { wrapper })
    await waitFor(() =>
      expect(result.current).toEqual({ kind: 'byok_ready', provider: 'anthropic', model: 'claude', region: 'us-east-1' }),
    )
  })
})
