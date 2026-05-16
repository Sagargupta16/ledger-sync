export const PROVIDERS = [
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'bedrock', label: 'AWS Bedrock' },
]

export const MODELS: Record<string, { value: string; label: string }[]> = {
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
  bedrock: [
    { value: 'us.anthropic.claude-opus-4-7', label: 'Claude Opus 4.7 (Bedrock)' },
    { value: 'us.anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Bedrock)' },
    {
      value: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
      label: 'Claude Haiku 4.5 (Bedrock)',
    },
  ],
}

export const isBedrock = (p: string) => p === 'bedrock'

/** Compact token formatter: 1234 -> "1.2k", 1_500_000 -> "1.5M". */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}
