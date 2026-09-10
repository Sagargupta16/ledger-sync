import { Eye, EyeOff } from 'lucide-react'

import Button from '@/components/ui/Button'
import type { AIConfig } from '@/services/api/aiConfig'

import { FieldHint, FieldLabel } from '../../sectionPrimitives'
import { inputClass, selectClass } from '../../styles'
import { MODELS, PROVIDERS, isBedrock } from './aiConstants'

interface ByokConfigFormProps {
  config: AIConfig | undefined
  provider: string
  setProvider: (v: string) => void
  model: string
  setModel: (v: string) => void
  region: string
  setRegion: (v: string) => void
  apiKey: string
  setApiKey: (v: string) => void
  showKey: boolean
  setShowKey: (v: boolean) => void
  setTestStatus: (s: 'idle' | 'testing' | 'success' | 'error') => void
}

export function ByokConfigForm(props: Readonly<ByokConfigFormProps>) {
  const {
    config,
    provider,
    setProvider,
    model,
    setModel,
    region,
    setRegion,
    apiKey,
    setApiKey,
    showKey,
    setShowKey,
    setTestStatus,
  } = props
  const providerModels = MODELS[provider] ?? []
  const hasStoredKey = config?.has_key && config.provider === provider

  return (
    <>
      <div>
        <FieldLabel htmlFor="ai-provider">Provider</FieldLabel>
        <select
          id="ai-provider"
          value={provider}
          onChange={(e) => {
            setProvider(e.target.value)
            setModel(MODELS[e.target.value]?.[0]?.value ?? '')
            setApiKey('')
            setShowKey(false)
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
            ? 'Use your Bedrock API key (bearer token from the AWS console). The server sends calls with your key, and AWS bills your account. Choose the shared app mode above to use the app quota.'
            : 'Your API key is stored encrypted. AI calls go directly from your browser to the provider and are billed to your account.'}
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
          <label htmlFor="ai-model-custom" className="sr-only">
            Custom model identifier
          </label>
          <input
            id="ai-model-custom"
            type="text"
            value={model}
            maxLength={100}
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
            maxLength={20}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="us-east-1"
            className={inputClass}
          />
        </div>
      )}

      {provider && (
        <div>
          <FieldLabel htmlFor="ai-key">
            {hasStoredKey ? 'Replace API Key (optional)' : 'API Key'}
          </FieldLabel>
          <div className="relative">
            <input
              id="ai-key"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              autoComplete="new-password"
              spellCheck={false}
              maxLength={16_384}
              required={!hasStoredKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setTestStatus('idle')
              }}
              placeholder={
                hasStoredKey
                  ? 'Leave blank to keep your saved key'
                  : 'Enter your API key'
              }
              className={`${inputClass} pr-12`}
            />
            <Button
              id="toggle-ai-key-visibility"
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowKey(!showKey)}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
              className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              icon={showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            >
              <span className="sr-only">{showKey ? 'Hide API key' : 'Show API key'}</span>
            </Button>
          </div>
          <FieldHint>
            {hasStoredKey
              ? 'Leave blank to keep your saved key when changing the model or region.'
              : 'A personal key is required for this provider. Changing providers requires a new key.'}
          </FieldHint>
        </div>
      )}
    </>
  )
}
