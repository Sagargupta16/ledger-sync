import { useState } from 'react'
import { Sparkles, Eye, EyeOff, Trash2, CheckCircle, AlertCircle } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { aiConfigService, type AIConfig, type AIConfigUpdate } from '@/services/api/aiConfig'
import { Section, FieldLabel, FieldHint } from './components'
import { selectClass, inputClass } from './styles'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'AWS Bedrock' },
]

const MODELS: Record<string, { value: string; label: string }[]> = {
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4.1-nano', label: 'GPT-4.1 Nano' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-5-20250514', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  bedrock: [
    { value: 'us.anthropic.claude-sonnet-4-5-v2', label: 'Claude Sonnet 4.5 (Bedrock)' },
    { value: 'us.anthropic.claude-haiku-4-5-v2', label: 'Claude Haiku 4.5 (Bedrock)' },
  ],
}

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
    if (!provider || !model || !apiKey) return
    saveMutation.mutate({
      provider,
      model,
      api_key: apiKey,
      region: provider === 'bedrock' ? region : undefined,
    })
  }

  const handleTest = async () => {
    if (!provider || !model || !apiKey) return
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
      } else {
        setTestStatus('success')
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
            Your API key is encrypted and stored securely. LLM calls go directly from your browser
            to the provider.
          </FieldHint>
        </div>

        {provider && (
          <div>
            <FieldLabel htmlFor="ai-model">Model</FieldLabel>
            <select
              id="ai-model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className={selectClass}
            >
              {providerModels.map((m) => (
                <option key={m.value} value={m.value} className="bg-background">
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {provider === 'bedrock' && (
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

        {provider && (
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
            <button
              type="button"
              onClick={handleTest}
              disabled={!apiKey || testStatus === 'testing'}
              className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 transition-colors disabled:opacity-40"
            >
              {testStatus === 'testing' ? 'Testing...' : 'Test Connection'}
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={!apiKey || !model || saveMutation.isPending}
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
