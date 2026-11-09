import { useQuery } from '@tanstack/react-query'

import { aiConfigService } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

/**
 * Whether the user can chat or ask for an explanation right now. The single
 * derivation from the `['ai-config']` query: while the config is loading or
 * failed, the mode is unknown, so nothing may be sent (a BYOK user's request
 * must never reach the app-funded model by default).
 */
export type AiAvailability =
  | { kind: 'loading' }
  | { kind: 'error'; retry: () => void }
  | { kind: 'demo' }
  | { kind: 'app' }
  /** BYOK mode with no stored key. */
  | { kind: 'byok_needs_key' }
  /** BYOK mode with a key but no provider or model chosen. */
  | { kind: 'byok_incomplete' }
  | { kind: 'byok_ready'; provider: string; model: string; region: string | null }

/** Why the assistant cannot be used yet; null when it can (or in demo, which has its own flow). */
export function aiUnavailableReason(availability: AiAvailability): string | null {
  switch (availability.kind) {
    case 'loading':
      return 'Loading your AI settings'
    case 'error':
      return 'Could not load AI settings'
    case 'byok_needs_key':
      return 'Add your AI key in Settings > AI Assistant'
    case 'byok_incomplete':
      return 'Choose a provider and model in Settings > AI Assistant'
    default:
      return null
  }
}

export function isAiReady(availability: AiAvailability): boolean {
  return availability.kind === 'app' || availability.kind === 'byok_ready'
}

export function useAiAvailability(): AiAvailability {
  const accessToken = useAuthStore((s) => s.accessToken)
  const isDemoMode = useDemoStore((s) => s.isDemoMode)
  const { data: config, isError, refetch } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    enabled: !!accessToken && !isDemoMode,
    staleTime: Infinity,
  })

  if (isDemoMode) return { kind: 'demo' }
  if (!config) {
    return isError ? { kind: 'error', retry: () => void refetch() } : { kind: 'loading' }
  }
  if (config.mode === 'app_bedrock') return { kind: 'app' }
  if (!config.has_key) return { kind: 'byok_needs_key' }
  if (!config.provider || !config.model) return { kind: 'byok_incomplete' }
  return { kind: 'byok_ready', provider: config.provider, model: config.model, region: config.region }
}
