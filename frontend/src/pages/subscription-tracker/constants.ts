import { RECURRENCE_FREQUENCIES, type RecurrenceFrequency } from '@/lib/recurrenceFrequency'
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

/**
 * Display labels for the frequency picker.
 *
 * `Record<RecurrenceFrequency, string>` so a new backend frequency cannot ship
 * without a label. The hand-written option list this replaced had no `daily`
 * entry, which made a daily commitment unpickable even though the backend
 * accepts it -- the same omission that made daily cost 12x instead of 365x.
 */
const FREQUENCY_LABELS: Readonly<Record<RecurrenceFrequency, string>> = {
  daily: 'Daily',
  weekly: 'Weekly',
  biweekly: 'Biweekly',
  monthly: 'Monthly',
  bimonthly: 'Bimonthly',
  quarterly: 'Quarterly',
  semiannual: 'Semi-annual',
  yearly: 'Yearly',
}

export const FREQUENCY_OPTIONS = RECURRENCE_FREQUENCIES.map((value) => ({
  value,
  label: FREQUENCY_LABELS[value],
}))
