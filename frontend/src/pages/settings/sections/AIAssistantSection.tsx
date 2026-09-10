import { useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { AlertCircle, CheckCircle, Sparkles, Trash2 } from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import Button from '@/components/ui/Button'
import { getApiErrorMessage } from '@/lib/errorUtils'
import { assertCurrentSession, getSessionGeneration, getSessionSignal, isCurrentSession } from '@/lib/session'
import {
  aiConfigService,
  type AIConfig,
  type AIConfigUpdate,
  type AIMode,
} from '@/services/api/aiConfig'
import { aiUsageService, type LimitsUpdateRequest, type UsageResponse } from '@/services/api/aiUsage'

import { Section } from '../sectionPrimitives'
import { ByokConfigForm } from './ai/ByokConfigForm'
import { AppModePanel, ModeToggle } from './ai/ModeToggle'
import { TokenLimitsPanel } from './ai/TokenLimitsPanel'
import { isBedrock } from './ai/aiConstants'

interface Props {
  index: number
}

export default function AIAssistantSection({ index }: Readonly<Props>) {
  const queryClient = useQueryClient()
  const sessionSignal = getSessionSignal()
  const {
    data: config,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<AIConfig>({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    staleTime: Infinity,
  })

  const [provider, setProvider] = useState(() => config?.provider ?? '')
  const [model, setModel] = useState(() => config?.model ?? '')
  const [apiKey, setApiKey] = useState('')
  const [region, setRegion] = useState(() => config?.region ?? 'us-east-1')
  const [showKey, setShowKey] = useState(false)
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle')
  const [testError, setTestError] = useState('')
  const [actionError, setActionError] = useState<string | null>(null)
  const [configConflict, setConfigConflict] = useState(false)
  const [limitsError, setLimitsError] = useState<string | null>(null)
  const [byokInteracted, setByokInteracted] = useState(false)
  const [limitsInteracted, setLimitsInteracted] = useState(false)
  const [lastSyncedConfig, setLastSyncedConfig] = useState(config)
  const [dailyLimit, setDailyLimit] = useState<string>(() =>
    config?.daily_token_limit == null ? '' : String(config.daily_token_limit),
  )
  const [monthlyLimit, setMonthlyLimit] = useState<string>(() =>
    config?.monthly_token_limit == null ? '' : String(config.monthly_token_limit),
  )

  // Adopt server changes only while that form has no unsaved edits.
  if (config && config !== lastSyncedConfig) {
    setLastSyncedConfig(config)
    if (!byokInteracted) {
      setProvider(config.provider ?? '')
      setModel(config.model ?? '')
      setRegion(config.region ?? 'us-east-1')
    }
    if (!limitsInteracted) {
      setDailyLimit(config.daily_token_limit == null ? '' : String(config.daily_token_limit))
      setMonthlyLimit(config.monthly_token_limit == null ? '' : String(config.monthly_token_limit))
    }
  }

  const { data: usage } = useQuery<UsageResponse>({
    queryKey: ['ai-usage'],
    queryFn: () => aiUsageService.get(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const publishConfig = async (data: AIConfig, signal: AbortSignal) => {
    await queryClient.cancelQueries({ queryKey: ['ai-config'] })
    assertCurrentSession(signal)
    queryClient.setQueryData(['ai-config'], data)
    void queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
  }

  const beginConfigWrite = () => {
    setActionError(null)
    setConfigConflict(false)
    return sessionSignal
  }

  const handleConfigError = (error: unknown, _variables: unknown, signal?: AbortSignal) => {
    if (!signal || !isCurrentSession(signal)) return
    setActionError(getApiErrorMessage(error))
    setConfigConflict(isAxiosError(error) && error.response?.status === 409)
  }

  const saveMutation = useMutation({
    mutationKey: ['ai-config', 'save', getSessionGeneration()],
    mutationFn: (data: AIConfigUpdate) => {
      assertCurrentSession(sessionSignal)
      return aiConfigService.updateConfig(data)
    },
    onMutate: beginConfigWrite,
    onSuccess: async (data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      await publishConfig(data, signal)
      setByokInteracted(false)
      setProvider(data.provider ?? '')
      setModel(data.model ?? '')
      setRegion(data.region ?? 'us-east-1')
      setApiKey('')
      setShowKey(false)
      setTestStatus('idle')
    },
    onError: handleConfigError,
  })

  const deleteMutation = useMutation({
    mutationKey: ['ai-config', 'delete', getSessionGeneration()],
    mutationFn: async () => {
      assertCurrentSession(sessionSignal)
      await aiConfigService.deleteConfig()
      assertCurrentSession(sessionSignal)
      return aiConfigService.getConfig()
    },
    onMutate: beginConfigWrite,
    onSuccess: async (data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      await publishConfig(data, signal)
      setByokInteracted(false)
      setProvider(data.provider ?? '')
      setModel(data.model ?? '')
      setRegion(data.region ?? 'us-east-1')
      setApiKey('')
      setShowKey(false)
      setTestStatus('idle')
      saveMutation.reset()
    },
    onError: handleConfigError,
  })

  const modeMutation = useMutation({
    mutationKey: ['ai-config', 'mode', getSessionGeneration()],
    mutationFn: (mode: AIMode) => {
      assertCurrentSession(sessionSignal)
      return aiConfigService.setMode(mode)
    },
    onMutate: beginConfigWrite,
    onSuccess: async (data, _variables, signal) => {
      if (signal && isCurrentSession(signal)) await publishConfig(data, signal)
    },
    onError: handleConfigError,
  })

  const limitsMutation = useMutation({
    mutationKey: ['ai-config', 'limits', getSessionGeneration()],
    mutationFn: async (limits: LimitsUpdateRequest) => {
      assertCurrentSession(sessionSignal)
      await aiUsageService.updateLimits(limits)
      assertCurrentSession(sessionSignal)
      return aiConfigService.getConfig()
    },
    onMutate: () => {
      setLimitsError(null)
      return sessionSignal
    },
    onSuccess: async (data, _variables, signal) => {
      if (!signal || !isCurrentSession(signal)) return
      await publishConfig(data, signal)
      setLimitsInteracted(false)
      setDailyLimit(data.daily_token_limit == null ? '' : String(data.daily_token_limit))
      setMonthlyLimit(data.monthly_token_limit == null ? '' : String(data.monthly_token_limit))
    },
    onError: (error, _variables, signal) => {
      if (signal && isCurrentSession(signal)) setLimitsError(getApiErrorMessage(error))
    },
  })

  const isBusy = saveMutation.isPending || deleteMutation.isPending || modeMutation.isPending
    || limitsMutation.isPending || testStatus === 'testing'
  const hasStoredKey = config?.has_key && config.provider === provider
  const validRegion = !isBedrock(provider) || /^[a-z0-9-]{1,20}$/.test(region.trim())
  const canSave = Boolean(provider && model.trim() && model.trim().length <= 100
    && validRegion && !configConflict && (apiKey.trim() || hasStoredKey))

  const reloadConfig = async () => {
    const result = await refetch()
    if (!isCurrentSession(sessionSignal)) return
    if (result.error) {
      setActionError(getApiErrorMessage(result.error))
      return
    }
    setConfigConflict(false)
    setActionError(null)
  }

  const editConfig = () => {
    setByokInteracted(true)
    if (!configConflict) setActionError(null)
    setTestStatus('idle')
    saveMutation.reset()
  }

  const editLimits = () => {
    setLimitsInteracted(true)
    setLimitsError(null)
    limitsMutation.reset()
  }

  const handleSave = () => {
    if (!canSave || isBusy) return
    saveMutation.mutate({
      provider,
      model: model.trim(),
      ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      region: isBedrock(provider) ? region.trim() : undefined,
    })
  }

  const handleSaveLimits = () => {
    if (isBusy) return
    const daily = dailyLimit.trim() === '' ? undefined : Number(dailyLimit)
    const monthly = monthlyLimit.trim() === '' ? undefined : Number(monthlyLimit)
    if (daily !== undefined && (!Number.isInteger(daily) || daily < 0 || daily > 10_000_000)) {
      setLimitsError('Enter a daily limit from 0 to 10,000,000 whole tokens, or leave it blank.')
      return
    }
    if (monthly !== undefined && (!Number.isInteger(monthly) || monthly < 0 || monthly > 100_000_000)) {
      setLimitsError('Enter a monthly limit from 0 to 100,000,000 whole tokens, or leave it blank.')
      return
    }
    limitsMutation.mutate({
      daily_token_limit: daily,
      monthly_token_limit: monthly,
      clear_daily: daily === undefined,
      clear_monthly: monthly === undefined,
    })
  }

  const handleTest = async () => {
    if (!provider || !model.trim() || !apiKey.trim() || isBedrock(provider) || isBusy) return
    setTestStatus('testing')
    setTestError('')
    try {
      const testPrompt = 'Reply with just the word "OK".'
      let url = ''
      let headers: Record<string, string> = {}
      let body = ''

      if (provider === 'openai') {
        url = 'https://api.openai.com/v1/chat/completions'
        headers = {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        }
        // o-series reasoning models reject max_tokens; they need
        // max_completion_tokens (and reasoning eats tokens, so allow more).
        const isReasoning = /^o\d/i.test(model)
        body = JSON.stringify({
          model: model.trim(),
          messages: [{ role: 'user', content: testPrompt }],
          ...(isReasoning ? { max_completion_tokens: 16 } : { max_tokens: 5 }),
        })
      } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKey.trim(),
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }
        body = JSON.stringify({
          model: model.trim(),
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 5,
        })
      } else {
        // Bare `return` left testStatus on 'testing' forever, so an unrecognised
        // provider spun the button's spinner with no error and no way out but a
        // reload. Every other exit from this function resolves the status.
        setTestError(`No connection test available for provider "${provider}"`)
        setTestStatus('error')
        return
      }

      assertCurrentSession(sessionSignal)
      const resp = await fetch(url, { method: 'POST', headers, body, signal: sessionSignal })
      assertCurrentSession(sessionSignal)
      if (resp.ok) {
        setTestStatus('success')
      } else {
        // Typed at the parse, not asserted after: `resp.json()` is `any`, so
        // reading `.error.message` off it was unchecked, and a provider that
        // answers a differently-shaped error body would have thrown on the
        // member access instead of falling back to the status code.
        const err: unknown = await resp.json().catch(() => ({}))
        assertCurrentSession(sessionSignal)
        const errMsg =
          (err as { error?: { message?: string } }).error?.message ?? `Error ${resp.status}`
        setTestError(errMsg)
        setTestStatus('error')
      }
    } catch {
      if (!isCurrentSession(sessionSignal)) return
      setTestError('Network error -- check your connection')
      setTestStatus('error')
    }
  }

  if (isLoading) return null
  if (isError && !config) {
    return (
      <Section
        index={index}
        icon={Sparkles}
        title="AI Assistant"
        description="Chat with your financial data"
      >
        <ErrorState
          variant="compact"
          title="Could not load AI settings"
          message="Your saved AI configuration is unavailable."
          onRetry={() => void refetch()}
        />
      </Section>
    )
  }

  const mode: AIMode = config?.mode ?? 'app_bedrock'
  const isByok = mode === 'byok'

  return (
    <Section
      index={index}
      icon={Sparkles}
      title="AI Assistant"
      description="Chat with your financial data"
    >
      <fieldset disabled={isBusy} aria-busy={isBusy} className="space-y-4 border-0 p-0 m-0 min-w-0">
        <legend className="sr-only">AI assistant settings</legend>
        <ModeToggle
          mode={mode}
          onChange={(next) => { if (next !== mode && !isBusy) modeMutation.mutate(next) }}
          appLimit={usage?.limits.app_daily_messages ?? 10}
          pending={isBusy}
        />

        {!isByok && <AppModePanel usage={usage} />}

        {isByok && (
          <>
            {!config?.has_key && (
              <p role="status" className="text-sm text-muted-foreground">
                Add a personal key to enable chat, or choose the shared app mode above.
              </p>
            )}
            <ByokConfigForm
              config={config}
              provider={provider}
              setProvider={(v) => { editConfig(); setProvider(v) }}
              model={model}
              setModel={(v) => { editConfig(); setModel(v) }}
              region={region}
              setRegion={(v) => { editConfig(); setRegion(v) }}
              apiKey={apiKey}
              setApiKey={(v) => { editConfig(); setApiKey(v) }}
              showKey={showKey}
              setShowKey={setShowKey}
              setTestStatus={setTestStatus}
            />

            {provider && (
              <div className="flex flex-wrap items-center gap-3 pt-2">
                {!isBedrock(provider) && (
                  <Button
                    id="test-ai-connection"
                    type="button"
                    variant="secondary"
                    // handleTest is async but wraps its whole body in
                    // try/catch (setTestError on failure), so it never
                    // rejects; `void` adapts it to the void-returning prop.
                    onClick={() => void handleTest()}
                    disabled={!apiKey.trim() || !model.trim() || isBusy}
                    isLoading={testStatus === 'testing'}
                  >
                    {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </Button>
                )}
                <Button
                  id="save-ai-configuration"
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || isBusy}
                  isLoading={saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving...' : saveMutation.isError ? 'Retry save' : 'Save'}
                </Button>
                {config?.has_key && (
                  <Button
                    id="remove-ai-configuration"
                    type="button"
                    variant="ghost"
                    onClick={() => deleteMutation.mutate()}
                    isLoading={deleteMutation.isPending}
                    className="text-app-red hover:bg-app-red/10 hover:text-app-red"
                    icon={<Trash2 className="w-3.5 h-3.5" />}
                  >
                    Remove
                  </Button>
                )}
              </div>
            )}

            {testStatus === 'success' && (
              <div role="status" className="flex items-center gap-2 text-sm text-app-green">
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                Connection successful
              </div>
            )}
            {testStatus === 'error' && (
              <div role="alert" className="flex items-center gap-2 text-sm text-app-red">
                <AlertCircle className="w-4 h-4" aria-hidden="true" />
                {testError}
              </div>
            )}

            {saveMutation.isSuccess && (
              <div role="status" className="flex items-center gap-2 text-sm text-app-green">
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                AI configuration saved. Open the chat widget (bottom-right) to start.
              </div>
            )}
          </>
        )}
        {actionError && (
          <div role="alert" className="space-y-2 text-sm text-app-red">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
              <span>{actionError}{saveMutation.isError ? ' Your edits are kept here.' : ''}</span>
            </div>
            {configConflict && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => void reloadConfig()}
                isLoading={isFetching}
              >
                Reload saved configuration
              </Button>
            )}
          </div>
        )}
        <TokenLimitsPanel
          usage={usage}
          dailyLimit={dailyLimit}
          setDailyLimit={(v) => { editLimits(); setDailyLimit(v) }}
          monthlyLimit={monthlyLimit}
          setMonthlyLimit={(v) => { editLimits(); setMonthlyLimit(v) }}
          onSave={handleSaveLimits}
          saving={limitsMutation.isPending}
          error={limitsError}
          saved={limitsMutation.isSuccess}
        />
      </fieldset>
    </Section>
  )
}
