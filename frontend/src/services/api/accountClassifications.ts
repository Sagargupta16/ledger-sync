import { apiClient } from './client'

/**
 * The account types the backend actually serves, in `AccountType` declaration
 * order -- `backend/src/ledger_sync/db/_models/enums.py`. The API serializes
 * `classification.account_type.value`, so these are the enum VALUES, not names.
 *
 * This is the single source of truth for the wire vocabulary. The previous union
 * here (`'Investment' | 'Debt' | 'Loan' | 'Savings' | 'Checking' | 'Credit Card'`)
 * shared ZERO values with the enum: every member was singular or invented, so a
 * comparison against it could never match a real response. `CreditCardHealth`
 * worked around it with a local `CREDIT_CARD_TYPE = 'Credit Cards'` constant and
 * a comment explaining the type was wrong, which is the drift this replaces.
 */
export const ACCOUNT_TYPE_VALUES = [
  'Cash',
  'Bank Accounts',
  'Credit Cards',
  'Investments',
  'Loans/Lended',
  'Other Wallets',
] as const

export type AccountTypeValue = (typeof ACCOUNT_TYPE_VALUES)[number]

/**
 * `GET /api/account-classifications/{account_name}` falls back to this literal
 * for an unclassified account (`api/account_classifications.py`), so it is a
 * response value the client must handle but never a value it may SEND.
 */
export const UNCLASSIFIED_ACCOUNT_TYPE = 'Other'

export interface AccountClassification {
  account_name: string
  account_type: AccountTypeValue | typeof UNCLASSIFIED_ACCOUNT_TYPE
}

export const accountClassificationsService = {
  getAllClassifications: async (): Promise<Record<string, string>> => {
    const response = await apiClient.get<Record<string, string>>('/api/account-classifications')
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
    const response = await apiClient.post<{ status: string; message?: string }>(
      `/api/account-classifications?account_name=${encodeURIComponent(accountName)}&account_type=${encodeURIComponent(accountType)}`
    )
    return response.data
  },

  deleteClassification: async (accountName: string): Promise<{ status: string }> => {
    const response = await apiClient.delete<{ status: string }>(
      `/api/account-classifications/${encodeURIComponent(accountName)}`
    )
    return response.data
  },

  getAccountsByType: async (accountType: string): Promise<{ accounts: string[] }> => {
    const response = await apiClient.get<{ accounts: string[] }>(
      `/api/account-classifications/type/${encodeURIComponent(accountType)}`
    )
    return response.data
  },

  getClosedAccounts: async (): Promise<string[]> => {
    const response = await apiClient.get<string[]>('/api/account-classifications/closed')
    return response.data
  },

  setAccountStatus: async (
    accountName: string,
    isClosed: boolean
  ): Promise<{ account_name: string; is_closed: boolean; status: string }> => {
    const response = await apiClient.put<{
      account_name: string
      is_closed: boolean
      status: string
    }>('/api/account-classifications/status', {
      account_name: accountName,
      is_closed: isClosed,
    })
    return response.data
  },
}
