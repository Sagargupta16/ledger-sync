import { apiClient } from './client'
import { getAccessToken } from '@/store/authStore'
import { API_BASE_URL } from '@/constants'

export interface MonthlyReportSummary {
  total_income: number
  total_expenses: number
  net_savings: number
  savings_rate: number
}

export interface MonthlyReportData {
  year: number
  month: number
  month_name: string
  summary: MonthlyReportSummary
  top_expense_categories: Array<{
    category: string
    amount: number
    percentage: number
  }>
  top_income_sources: Array<{
    category: string
    amount: number
  }>
  comparison: {
    prev_month_name: string
    prev_year: number
    current_income: number
    previous_income: number
    income_change_pct: number
    current_expenses: number
    previous_expenses: number
    expenses_change_pct: number
    current_savings: number
    previous_savings: number
    savings_change_pct: number
  }
}

export const reportsApi = {
  /**
   * Fetch the monthly report as JSON data.
   */
  getMonthlyReportJson: (year: number, month: number) =>
    apiClient.get<MonthlyReportData>('/api/reports/monthly', {
      params: { year, month, format: 'json' },
    }),
}

/**
 * Download (open) the monthly HTML report in a new browser tab.
 * The user can then print it or save as PDF via the browser's print dialog.
 */
export async function downloadMonthlyReport(year: number, month: number) {
  const token = getAccessToken()
  const res = await fetch(`${API_BASE_URL}/api/reports/monthly?year=${year}&month=${month}&format=html`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const html = await res.text()
  const blob = new Blob([html], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (win) {
    win.addEventListener('load', () => URL.revokeObjectURL(url))
  } else {
    URL.revokeObjectURL(url)
  }
}
