import { CheckCircle, Key, Zap } from 'lucide-react'

import type { AIMode } from '@/services/api/aiConfig'
import type { UsageResponse } from '@/services/api/aiUsage'

import { FieldHint, FieldLabel } from '../../sectionPrimitives'

interface ModeToggleProps {
  mode: AIMode
  onChange: (mode: AIMode) => void
  appLimit: number
  pending: boolean
}

function usageTone(ratio: number): string {
  if (ratio >= 1) return 'text-app-red'
  if (ratio >= 0.8) return 'text-app-yellow'
  return 'text-muted-foreground'
}

export function ModeToggle({ mode, onChange, appLimit, pending }: Readonly<ModeToggleProps>) {
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

interface ModeCardProps {
  selected: boolean
  disabled: boolean
  onClick: () => void
  icon: React.ReactNode
  title: string
  subtitle: string
}

function ModeCard(props: Readonly<ModeCardProps>) {
  const { selected, disabled, onClick, icon, title, subtitle } = props
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

export function AppMessageBadge({
  usage,
}: Readonly<{ usage: UsageResponse | undefined }>) {
  if (!usage) return null
  const used = usage.messages_today
  const cap = usage.limits.app_daily_messages
  const remaining = Math.max(cap - used, 0)
  const ratio = cap > 0 ? used / cap : 0
  const tone = usageTone(ratio)
  return (
    <span className={`text-xs font-mono ${tone}`}>
      {remaining} / {cap} left
    </span>
  )
}

export function AppModePanel({
  usage,
}: Readonly<{ usage: UsageResponse | undefined }>) {
  return (
    <div className="border border-border rounded-xl p-4 space-y-2 bg-white/[0.02]">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-white">Today's usage</span>
        <AppMessageBadge usage={usage} />
      </div>
      <FieldHint>
        App mode uses a shared AWS Bedrock key and is rate-limited so it stays free. Switch to
        "Bring your own key" above for unlimited usage with your own provider.
      </FieldHint>
    </div>
  )
}
