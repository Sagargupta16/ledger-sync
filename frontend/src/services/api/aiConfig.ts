import { apiClient } from './client'

export interface AIConfig {
  provider: string | null
  model: string | null
  has_key: boolean
  region: string | null
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
}
