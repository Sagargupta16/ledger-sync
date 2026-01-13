import { apiClient } from './client'

export interface AccountClassification {
  account_name: string
  account_type: 'Investment' | 'Debt' | 'Loan' | 'Savings' | 'Checking' | 'Credit Card' | 'Other'
}

export const accountClassificationsService = {
  getAllClassifications: async (): Promise<Record<string, string>> => {
    const response = await apiClient.get('/api/account-classifications')
    return response.data
  },

  getClassification: async (accountName: string): Promise<AccountClassification> => {
    const response = await apiClient.get<AccountClassification>(
      `/api/account-classifications/${encodeURIComponent(accountName)}`
    )
    return response.data
  },

  setClassification: async (
    accountName: string,
    accountType: string
  ): Promise<{ status: string; message?: string }> => {
    const response = await apiClient.post(
      `/api/account-classifications?account_name=${encodeURIComponent(accountName)}&account_type=${encodeURIComponent(accountType)}`
    )
    return response.data
  },

  deleteClassification: async (accountName: string): Promise<{ status: string }> => {
    const response = await apiClient.delete(
      `/api/account-classifications/${encodeURIComponent(accountName)}`
    )
    return response.data
  },

  getAccountsByType: async (accountType: string): Promise<{ accounts: string[] }> => {
    const response = await apiClient.get(
      `/api/account-classifications/type/${encodeURIComponent(accountType)}`
    )
    return response.data
  },
}
