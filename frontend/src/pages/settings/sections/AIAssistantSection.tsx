import { useState } from 'react'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckCircle, Sparkles, Trash2 } from 'lucide-react'

import {
  aiConfigService,
  type AIConfig,
  type AIConfigUpdate,
  type AIMode,
} from '@/services/api/aiConfig'
import { aiUsageService, type UsageResponse } from '@/services/api/aiUsage'

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
  const { data: config, isLoading } = useQuery<AIConfig>({
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

  // provider/model/region are seeded lazily, but the ['ai-config'] query has
  // not resolved on first render so the initializers capture the empty
  // defaults. Unlike the limit fields below they had no resync, so a saved BYOK
  // config showed blank Provider/Model/Region until the user re-picked. Mirror
  // the lastSynced* reconciliation: when config arrives (or changes), adopt it
  // -- but only until the user edits, so we never clobber an in-progress change.
  const [byokInteracted, setByokInteracted] = useState(false)
  const [lastSyncedProvider, setLastSyncedProvider] = useState(config?.provider ?? null)
  if (config && !byokInteracted && (config.provider ?? '') !== (lastSyncedProvider ?? '')) {
    setLastSyncedProvider(config.provider ?? null)
    setProvider(config.provider ?? '')
    setModel(config.model ?? '')
    setRegion(config.region ?? 'us-east-1')
  }

  const [dailyLimit, setDailyLimit] = useState<string>(() =>
    config?.daily_token_limit == null ? '' : String(config.daily_token_limit),
  )
  const [monthlyLimit, setMonthlyLimit] = useState<string>(() =>
    config?.monthly_token_limit == null ? '' : String(config.monthly_token_limit),
  )
  const [lastSyncedDaily, setLastSyncedDaily] = useState(config?.daily_token_limit ?? null)
  const [lastSyncedMonthly, setLastSyncedMonthly] = useState(config?.monthly_token_limit ?? null)
  const persistedDaily = config?.daily_token_limit ?? null
  const persistedMonthly = config?.monthly_token_limit ?? null
  if (persistedDaily !== lastSyncedDaily) {
    setLastSyncedDaily(persistedDaily)
    setDailyLimit(persistedDaily == null ? '' : String(persistedDaily))
  }
  if (persistedMonthly !== lastSyncedMonthly) {
    setLastSyncedMonthly(persistedMonthly)
    setMonthlyLimit(persistedMonthly == null ? '' : String(persistedMonthly))
  }

  const { data: usage } = useQuery<UsageResponse>({
    queryKey: ['ai-usage'],
    queryFn: () => aiUsageService.get(),
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const saveMutation = useMutation({
    mutationFn: (data: AIConfigUpdate) => aiConfigService.updateConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      setApiKey('')
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => aiConfigService.deleteConfig(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      setProvider('')
      setModel('')
      setApiKey('')
    },
  })

  const modeMutation = useMutation({
    mutationFn: (mode: AIMode) => aiConfigService.setMode(mode),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
    },
  })

  const limitsMutation = useMutation({
    mutationFn: async () => {
      const daily = dailyLimit.trim()
      const monthly = monthlyLimit.trim()
      await aiUsageService.updateLimits({
        daily_token_limit:
          daily === '' ? undefined : Math.max(0, Number.parseInt(daily, 10)),
        monthly_token_limit:
          monthly === '' ? undefined : Math.max(0, Number.parseInt(monthly, 10)),
        clear_daily: daily === '',
        clear_monthly: monthly === '',
      })
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ai-config'] })
      queryClient.invalidateQueries({ queryKey: ['ai-usage'] })
    },
  })

  const handleSave = () => {
    if (!provider || !model) return
    if (!isBedrock(provider) && !apiKey) return
    saveMutation.mutate({
      provider,
      model,
      api_key: isBedrock(provider) ? 'bedrock-uses-aws-credentials' : apiKey,
      region: isBedrock(provider) ? region : undefined,
    })
  }

  const handleTest = async () => {
    if (!provider || !model) return
    if (!isBedrock(provider) && !apiKey) return
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
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }
        // o-series reasoning models reject max_tokens; they need
        // max_completion_tokens (and reasoning eats tokens, so allow more).
        const isReasoning = /^o\d/i.test(model)
        body = JSON.stringify({
          model,
          messages: [{ role: 'user', content: testPrompt }],
          ...(isReasoning ? { max_completion_tokens: 16 } : { max_tokens: 5 }),
        })
      } else if (provider === 'anthropic') {
        url = 'https://api.anthropic.com/v1/messages'
        headers = {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        }
        body = JSON.stringify({
          model,
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 5,
        })
      } else if (isBedrock(provider)) {
        setTestError(
          'Save config, then test via the chat widget (Bedrock uses server-side AWS credentials)',
        )
        setTestStatus('error')
        return
      } else {
        return
      }

      const resp = await fetch(url, { method: 'POST', headers, body })
      if (resp.ok) {
        setTestStatus('success')
      } else {
        const err = await resp.json().catch(() => ({}))
        const errMsg =
          (err as { error?: { message?: string } }).error?.message ?? `Error ${resp.status}`
        setTestError(errMsg)
        setTestStatus('error')
      }
    } catch {
      setTestError('Network error -- check your connection')
      setTestStatus('error')
    }
  }

  const canSave = provider && model && (isBedrock(provider) || apiKey)

  if (isLoading) return null

  const mode: AIMode = config?.mode ?? 'app_bedrock'
  const isByok = mode === 'byok'

  return (
    <Section
      index={index}
      icon={Sparkles}
      title="AI Assistant"
      description="Chat with your financial data"
    >
      <div className="space-y-4">
        <ModeToggle
          mode={mode}
          onChange={(next) => modeMutation.mutate(next)}
          appLimit={usage?.limits.app_daily_messages ?? 10}
          pending={modeMutation.isPending}
        />

        {!isByok && <AppModePanel usage={usage} />}

        {isByok && (
          <>
            <ByokConfigForm
              config={config}
              provider={provider}
              setProvider={(v) => { setByokInteracted(true); setProvider(v) }}
              model={model}
              setModel={(v) => { setByokInteracted(true); setModel(v) }}
              region={region}
              setRegion={(v) => { setByokInteracted(true); setRegion(v) }}
              apiKey={apiKey}
              setApiKey={setApiKey}
              showKey={showKey}
              setShowKey={setShowKey}
              setTestStatus={setTestStatus}
            />

            {(provider || (usage && usage.all_time.call_count > 0)) && (
              <TokenLimitsPanel
                usage={usage}
                dailyLimit={dailyLimit}
                setDailyLimit={setDailyLimit}
                monthlyLimit={monthlyLimit}
                setMonthlyLimit={setMonthlyLimit}
                onSave={() => limitsMutation.mutate()}
                saving={limitsMutation.isPending}
              />
            )}

            {provider && (
              <div className="flex items-center gap-3 pt-2">
                {!isBedrock(provider) && (
                  <button
                    type="button"
                    onClick={handleTest}
                    disabled={!apiKey || testStatus === 'testing'}
                    className="px-4 py-2 text-sm bg-[var(--overlay-5)] text-foreground rounded-lg hover:bg-[var(--overlay-6)] transition-colors disabled:opacity-40"
                  >
                    {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canSave || saveMutation.isPending}
                  className="px-4 py-2 text-sm bg-gradient-to-r from-primary to-secondary text-on-accent rounded-lg hover:shadow-lg disabled:opacity-40 font-medium"
                >
                  {saveMutation.isPending ? 'Saving...' : 'Save'}
                </button>
                {config?.has_key && (
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate()}
                    className="px-4 py-2 text-sm text-app-red hover:bg-app-red/10 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
            )}

            {testStatus === 'success' && (
              <div className="flex items-center gap-2 text-sm text-app-green">
                <CheckCircle className="w-4 h-4" />
                Connection successful
              </div>
            )}
            {testStatus === 'error' && (
              <div className="flex items-center gap-2 text-sm text-app-red">
                <AlertCircle className="w-4 h-4" />
                {testError}
              </div>
            )}

            {saveMutation.isSuccess && (
              <div className="flex items-center gap-2 text-sm text-app-green">
                <CheckCircle className="w-4 h-4" />
                AI configuration saved. Open the chat widget (bottom-right) to start.
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  )
}
