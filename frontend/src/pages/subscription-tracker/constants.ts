import type { Suggestion } from './types'

export const SUGGESTIONS: Suggestion[] = [
  { name: 'Salary', type: 'Income', frequency: 'monthly', category: 'Salary' },
  { name: 'Freelance Income', type: 'Income', frequency: 'monthly', category: 'Freelance' },
  { name: 'Rental Income', type: 'Income', frequency: 'monthly', category: 'Rental Income' },
  { name: 'Family Support', type: 'Expense', frequency: 'monthly', category: 'Family' },
  { name: 'House Rent', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Electricity Bill', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'WiFi / Internet', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'Water Bill', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'Gas Bill', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
  { name: 'Maid', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Cook', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Society Maintenance', type: 'Expense', frequency: 'monthly', category: 'Housing' },
  { name: 'Netflix / OTT', type: 'Expense', frequency: 'monthly', category: 'Entertainment' },
  { name: 'Gym Membership', type: 'Expense', frequency: 'monthly', category: 'Health' },
  { name: 'Insurance Premium', type: 'Expense', frequency: 'yearly', category: 'Insurance' },
  { name: 'SIP / Investment', type: 'Expense', frequency: 'monthly', category: 'Investment' },
  { name: 'EMI', type: 'Expense', frequency: 'monthly', category: 'Loan' },
  { name: 'Mobile Recharge', type: 'Expense', frequency: 'monthly', category: 'Utilities' },
]

export const FREQUENCY_OPTIONS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Biweekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'bimonthly', label: 'Bimonthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'semiannual', label: 'Semi-annual' },
  { value: 'yearly', label: 'Yearly' },
]
