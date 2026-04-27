import { useState } from 'react'
import { Sparkles, Eye, EyeOff, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiConfigService, type AIConfig, type AIConfigUpdate } from '@/services/api/aiConfig'
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

  return (
    <Section
      index={index}
      icon={Sparkles}
      title="AI Assistant"
      description="Configure your AI provider to chat with your financial data"
      defaultCollapsed={!config?.has_key}
    >
      <div className="space-y-4">
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
      </div>
    </Section>
  )
}
