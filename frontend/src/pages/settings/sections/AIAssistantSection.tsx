import { useState } from 'react'
import { Sparkles, Eye, EyeOff, Trash2, CheckCircle, AlertCircle, Zap, Key } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  aiConfigService,
  type AIConfig,
  type AIConfigUpdate,
  type AIMode,
} from '@/services/api/aiConfig'
import { aiUsageService, type UsageResponse } from '@/services/api/aiUsage'
import { Section, FieldLabel, FieldHint } from '../sectionPrimitives'
import { selectClass, inputClass } from '../styles'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'AWS Bedrock' },
]

const MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'o3', label: 'O3' },
    { value: 'o4-mini', label: 'O4 Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  ],
  anthropic: [
    { value: 'claude-opus-4-7', label: 'Claude Opus 4.7' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  // Bedrock cross-region inference-profile IDs. Version suffixes here are
  // inconsistent by design -- they mirror the exact identifiers AWS ships.
  // If a newer ID is needed, pick "Custom model ID..." below and paste it
  // from the Bedrock console rather than editing this list each time.
  bedrock: [
    { value: 'us.anthropic.claude-opus-4-7', label: 'Claude Opus 4.7 (Bedrock)' },
    { value: 'us.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Bedrock)' },
    { value: 'us.anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5 (Bedrock)' },
  ],
}

interface Props {
  index: number
}

const isBedrock = (p: string) => p === 'bedrock'

/** Compact token formatter: 1234 -> "1.2k", 1_500_000 -> "1.5M". */
function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
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

  // Token-limit fields are edited as strings to keep "empty = no limit" UX.
  // Blank input means "clear the limit"; a parsed positive int sets it.
  // React 19 disallows setState-in-effect for syncing to props, so we use
  // the "track previous snapshot" pattern: when the persisted limits change
  // (e.g. initial load, or after a save from another tab), reset the inputs
  // to the new persisted value during render. Users editing the input keep
  // their in-progress value because the persisted prop hasn't changed.
  const [dailyLimit, setDailyLimit] = useState<string>(
    () => (config?.daily_token_limit != null ? String(config.daily_token_limit) : ''),
  )
  const [monthlyLimit, setMonthlyLimit] = useState<string>(
    () => (config?.monthly_token_limit != null ? String(config.monthly_token_limit) : ''),
  )
  const [lastSyncedDaily, setLastSyncedDaily] = useState(config?.daily_token_limit ?? null)
  const [lastSyncedMonthly, setLastSyncedMonthly] = useState(config?.monthly_token_limit ?? null)
  const persistedDaily = config?.daily_token_limit ?? null
  const persistedMonthly = config?.monthly_token_limit ?? null
  if (persistedDaily !== lastSyncedDaily) {
    setLastSyncedDaily(persistedDaily)
    setDailyLimit(persistedDaily != null ? String(persistedDaily) : '')
  }
  if (persistedMonthly !== lastSyncedMonthly) {
    setLastSyncedMonthly(persistedMonthly)
    setMonthlyLimit(persistedMonthly != null ? String(persistedMonthly) : '')
  }

  // Live usage panel: "1.2k of 50k today · $0.04".
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
      // Empty string -> clear_* flag so nullable limits can actually be nulled.
      const daily = dailyLimit.trim()
      const monthly = monthlyLimit.trim()
      await aiUsageService.updateLimits({
        daily_token_limit: daily === '' ? undefined : Math.max(0, Number.parseInt(daily, 10)),
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
        headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
        body = JSON.stringify({
          model,
          messages: [{ role: 'user', content: testPrompt }],
          max_tokens: 5,
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
        setTestError('Save config, then test via the chat widget (Bedrock uses server-side AWS credentials)')
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

  const providerModels = MODELS[provider] ?? []
  const needsApiKey = provider && !isBedrock(provider)
  const canSave = provider && model && (isBedrock(provider) || apiKey)

  if (isLoading) return null

  // Single source of truth for which mode is active. Default is app_bedrock
  // if the backend hasn't returned prefs yet -- matches the server default.
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
        {/* Mode picker -- stacked cards so each option's trade-offs fit. */}
        <ModeToggle
          mode={mode}
          onChange={(next) => modeMutation.mutate(next)}
          appLimit={usage?.limits.app_daily_messages ?? 10}
          pending={modeMutation.isPending}
        />

        {/* App-mode panel: the server owns the provider/model/key. Users just
            see the default model + "X of N messages left today". */}
        {!isByok && (
          <div className="border border-border rounded-xl p-4 space-y-2 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-white">Today's usage</span>
              <AppMessageBadge usage={usage} />
            </div>
            <FieldHint>
              App mode uses a shared AWS Bedrock key and is rate-limited so it stays free.
              Switch to "Bring your own key" above for unlimited usage with your own provider.
            </FieldHint>
          </div>
        )}

        {/* Everything below is BYOK-only: provider + model + API key + per-user
            token limits. Wrapped in a single conditional so the diff stays
            small and app-mode users see a clean, uncluttered panel. */}
        {isByok && (
          <>
        <div>
          <FieldLabel htmlFor="ai-provider">Provider</FieldLabel>
          <select
            id="ai-provider"
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value)
              setModel(MODELS[e.target.value]?.[0]?.value ?? '')
              setTestStatus('idle')
            }}
            className={selectClass}
          >
            <option value="" className="bg-background">
              Select a provider
            </option>
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value} className="bg-background">
                {p.label}
              </option>
            ))}
          </select>
          <FieldHint>
            {isBedrock(provider)
              ? 'Bedrock uses server-side AWS credentials (env vars or ~/.aws/credentials).'
              : 'Your API key is encrypted and stored securely. LLM calls go directly from your browser to the provider.'}
          </FieldHint>
        </div>

        {provider && (
          <div>
            <FieldLabel htmlFor="ai-model">Model</FieldLabel>
            <select
              id="ai-model"
              value={providerModels.some((m) => m.value === model) ? model : '__custom'}
              onChange={(e) => setModel(e.target.value === '__custom' ? '' : e.target.value)}
              className={selectClass}
            >
              {providerModels.map((m) => (
                <option key={m.value} value={m.value} className="bg-background">
                  {m.label}
                </option>
              ))}
              <option value="__custom" className="bg-background">
                Custom model ID...
              </option>
            </select>
            {/* Free-text field so users can paste any model ID (Bedrock inference
                profile IDs, new OpenAI/Anthropic model names, etc.) without
                waiting on a code update when vendor catalogs change. */}
            <input
              id="ai-model-custom"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={
                isBedrock(provider)
                  ? 'e.g. us.anthropic.claude-opus-4-1-20250805-v1:0'
                  : 'Model identifier'
              }
              className={`${inputClass} mt-2 font-mono text-xs`}
            />
            <FieldHint>
              {isBedrock(provider)
                ? 'Use the exact Bedrock model ID or inference-profile ID from the AWS console. If the dropdown list is out of date, pick "Custom" and paste the current ID.'
                : 'Pick from the list or enter a model identifier directly.'}
            </FieldHint>
          </div>
        )}

        {isBedrock(provider) && (
          <div>
            <FieldLabel htmlFor="ai-region">AWS Region</FieldLabel>
            <input
              id="ai-region"
              type="text"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              placeholder="us-east-1"
              className={inputClass}
            />
          </div>
        )}

        {needsApiKey && (
          <div>
            <FieldLabel htmlFor="ai-key">
              {config?.has_key ? 'Update API Key' : 'API Key'}
            </FieldLabel>
            <div className="relative">
              <input
                id="ai-key"
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setTestStatus('idle')
                }}
                placeholder={
                  config?.has_key ? 'Key configured (enter new to update)' : 'Enter your API key'
                }
                className={`${inputClass} pr-10`}
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-white"
              >
                {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}

        {/* Usage + token limits panel. Always visible when the user has
            ever sent a chat (usage exists) or has configured an AI provider
            (so new users can proactively set limits before using BYOK). */}
        {(provider || (usage && usage.all_time.call_count > 0)) && (
          <div className="border-t border-border pt-4 space-y-3">
            <div className="flex items-baseline justify-between gap-2">
              <FieldLabel htmlFor="ai-daily-limit">Token usage &amp; limits</FieldLabel>
              {usage && (
                <div className="text-xs text-muted-foreground font-mono">
                  Today {formatTokens(usage.today.total_tokens)}
                  {usage.limits.daily ? ` / ${formatTokens(usage.limits.daily)}` : ''}
                  <span className="text-text-quaternary"> · </span>
                  MTD {formatTokens(usage.month_to_date.total_tokens)}
                  {usage.limits.monthly ? ` / ${formatTokens(usage.limits.monthly)}` : ''}
                  {usage.all_time.cost_usd > 0 && (
                    <>
                      <span className="text-text-quaternary"> · </span>
                      <span title="All-time estimated cost (USD)">
                        ${usage.all_time.cost_usd.toFixed(2)}
                      </span>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor="ai-daily-limit" className="text-xs text-muted-foreground mb-1 block">
                  Daily limit (tokens)
                </label>
                <input
                  id="ai-daily-limit"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={1000}
                  value={dailyLimit}
                  onChange={(e) => setDailyLimit(e.target.value)}
                  placeholder="No limit"
                  className={inputClass}
                />
              </div>
              <div>
                <label
                  htmlFor="ai-monthly-limit"
                  className="text-xs text-muted-foreground mb-1 block"
                >
                  Monthly limit (tokens)
                </label>
                <input
                  id="ai-monthly-limit"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={10000}
                  value={monthlyLimit}
                  onChange={(e) => setMonthlyLimit(e.target.value)}
                  placeholder="No limit"
                  className={inputClass}
                />
              </div>
            </div>
            <FieldHint>
              Leave blank for no cap. Server-side Bedrock calls are blocked when
              today's or this month's usage would exceed the limit. For
              browser-direct providers (OpenAI, Anthropic) the limits are
              informational only -- the provider still charges your key.
            </FieldHint>
            <button
              type="button"
              onClick={() => limitsMutation.mutate()}
              disabled={limitsMutation.isPending}
              className="px-3 py-1.5 text-xs bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40"
            >
              {limitsMutation.isPending ? 'Saving limits...' : 'Save limits'}
            </button>
          </div>
        )}

        {provider && (
          <div className="flex items-center gap-3 pt-2">
            {!isBedrock(provider) && (
              <button
                type="button"
                onClick={handleTest}
                disabled={!apiKey || testStatus === 'testing'}
                className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40"
              >
                {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
              </button>
            )}
            <button
              type="button"
              onClick={handleSave}
              disabled={!canSave || saveMutation.isPending}
              className="px-4 py-2 text-sm bg-gradient-to-r from-primary to-secondary text-white rounded-lg hover:shadow-lg disabled:opacity-40 font-medium"
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
        {/* end of BYOK-only block */}
        </>
        )}
      </div>
    </Section>
  )
}

/**
 * Two stacked radio cards: "App (shared Bedrock, rate-limited)" and
 * "Bring your own key". Server-side PATCH commits the change immediately --
 * no "Save" button needed because flipping modes is reversible and has no
 * other state to sync.
 */
function ModeToggle({
  mode,
  onChange,
  appLimit,
  pending,
}: Readonly<{
  mode: AIMode
  onChange: (mode: AIMode) => void
  appLimit: number
  pending: boolean
}>) {
  return (
    <div className="space-y-2">
      <FieldLabel htmlFor="">How to power the chat</FieldLabel>
      <div className="grid grid-cols-1 gap-2">
        <ModeCard
          selected={mode === 'app_bedrock'}
          disabled={pending}
          onClick={() => onChange('app_bedrock')}
          icon={<Zap className="w-4 h-4" />}
          title="Use the app's shared key (free, limited)"
          subtitle={`Up to ${appLimit} messages per day. No setup. Model picked by the app.`}
        />
        <ModeCard
          selected={mode === 'byok'}
          disabled={pending}
          onClick={() => onChange('byok')}
          icon={<Key className="w-4 h-4" />}
          title="Bring your own key (BYOK)"
          subtitle="Unlimited usage with your own OpenAI, Anthropic, or Bedrock key. You pay your provider."
        />
      </div>
    </div>
  )
}

function ModeCard({
  selected,
  disabled,
  onClick,
  icon,
  title,
  subtitle,
}: Readonly<{
  selected: boolean
  disabled: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
}>) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`text-left border rounded-xl p-3 transition-colors ${
        selected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-white/[0.02] hover:border-white/20 hover:bg-white/[0.04]'
      } disabled:opacity-50 disabled:cursor-wait`}
    >
      <div className="flex items-center gap-2">
        <span className={selected ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
        <span className="text-sm font-medium text-white">{title}</span>
        {selected && <CheckCircle className="w-3.5 h-3.5 text-primary ml-auto" />}
      </div>
      <p className="text-xs text-muted-foreground mt-1 ml-6">{subtitle}</p>
    </button>
  )
}

/**
 * Shows "7 of 10 messages left today · resets midnight UTC" when the user
 * is in app_bedrock mode. Colours degrade red/yellow as the cap approaches.
 */
function AppMessageBadge({ usage }: Readonly<{ usage: UsageResponse | undefined }>) {
  if (!usage) return null
  const used = usage.messages_today
  const cap = usage.limits.app_daily_messages
  const remaining = Math.max(cap - used, 0)
  const ratio = cap > 0 ? used / cap : 0
  const tone =
    ratio >= 1 ? 'text-app-red' : ratio >= 0.8 ? 'text-app-yellow' : 'text-muted-foreground'
  return (
    <span className={`text-xs font-mono ${tone}`}>
      {remaining} / {cap} left
    </span>
  )
}
