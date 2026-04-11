/** Flexible column name mappings — mirrors backend settings.py. */
export const COLUMN_MAPPINGS: Record<string, string[]> = {
  date: ['Period', 'Date', 'date', 'period'],
  account: ['Accounts', 'Account', 'account', 'accounts'],
  category: ['Category', 'category'],
  amount: ['Amount / INR', 'Amount', 'amount', 'Amount/INR'],
  type: ['Income/Expense', 'Type', 'type', 'Transaction Type'],
  note: ['Note', 'note', 'Notes', 'notes', 'Description'],
  subcategory: ['Subcategory', 'subcategory', 'Sub Category'],
  currency: ['Currency', 'currency'],
}

export const REQUIRED_COLUMNS = ['date', 'account', 'category', 'amount', 'type'] as const

export const VALID_TYPES = new Set([
  'income',
  'expense',
  'exp.',
  'expenses',
  'transfer',
  'transfer-in',
  'transfer in',
  'transfer-out',
  'transfer out',
])
