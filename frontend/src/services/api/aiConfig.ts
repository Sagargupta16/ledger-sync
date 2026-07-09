import { apiClient } from './client'

/** "app_bedrock" = uses the shared server Bedrock key (rate-limited).
 *  "byok" = user brings their own OpenAI / Anthropic / Bedrock key. */
export type AIMode = 'app_bedrock' | 'byok'

export interface AIConfig {
  mode: AIMode
  provider: string | null
  model: string | null
  has_key: boolean
  region: string | null
  /** Per-user daily/monthly token caps (BYOK only). `null` = no limit. */
  daily_token_limit: number | null
  monthly_token_limit: number | null
}

export interface AIConfigUpdate {
  provider: string
  model: string
  api_key: string
  region?: string
}

export const aiConfigService = {
  async getConfig(): Promise<AIConfig> {
    const response = await apiClient.get<AIConfig>('/api/preferences/ai-config')
    return response.data
  },

  async updateConfig(config: AIConfigUpdate): Promise<AIConfig> {
    const response = await apiClient.put<AIConfig>('/api/preferences/ai-config', config)
    return response.data
  },

  async getKey(): Promise<string> {
    const response = await apiClient.get<{ api_key: string }>('/api/preferences/ai-config/key')
    return response.data.api_key
  },

  async deleteConfig(): Promise<void> {
    await apiClient.delete('/api/preferences/ai-config')
  },

  async setMode(mode: AIMode): Promise<AIConfig> {
    const response = await apiClient.patch<AIConfig>('/api/preferences/ai-config/mode', { mode })
    return response.data
  },
}
