/**
 * Plain-words labels for the tool calls behind a canvas answer: the live step
 * list while it generates, and the "How this was made" list under each chart.
 */

export type StepStatus = 'running' | 'done' | 'error'

export interface ProgressStep {
  readonly id: number
  readonly label: string
  readonly status: StepStatus
}

/** The first step, shown from the moment a request is sent. */
export const READING_STEP = 'Reading your request'
export const WRITING_STEP = 'Writing the takeaway'

const GRAINS: Record<string, string> = {
  month: 'month',
  quarter: 'quarter',
  fiscal_year: 'fiscal year',
  year: 'year',
  category: 'category',
  subcategory: 'subcategory',
  account: 'account',
  type: 'type',
}

const FIXED: Record<string, string> = {
  list_categories: 'Finding your categories',
  list_accounts: 'Listing your accounts',
  search_transactions: 'Searching your transactions',
  get_monthly_summary: 'Reading a monthly summary',
  list_recent_months: 'Reading recent months',
  get_net_worth: 'Reading your net worth',
  get_cash_flow: 'Reading your cash flow',
  get_fy_summary: 'Reading a fiscal-year summary',
  get_tax_summary: 'Reading your tax summary',
  list_budgets: 'Reading your budgets',
  list_recurring: 'Reading recurring payments',
  list_goals: 'Reading your goals',
  list_anomalies: 'Reading anomalies',
  get_preferences_summary: 'Reading your settings',
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function list(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  const names = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  if (names.length === 0) return null
  return names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ')
}

function range(input: Record<string, unknown>): string {
  const start = text(input.start_date)
  const end = text(input.end_date)
  if (start && end) return `, ${start} to ${end}`
  if (start) return `, from ${start}`
  if (end) return `, up to ${end}`
  return ''
}

const KINDS: Record<string, string> = { Income: 'income', Expense: 'expenses', Transfer: 'transfers' }

function aggregateLabel(input: Record<string, unknown>): string {
  const what = KINDS[text(input.type) ?? ''] ?? 'transactions'
  const verb = input.measure === 'count' ? 'Counting' : 'Totalling'
  const grain = GRAINS[text(input.group_by) ?? 'month'] ?? 'month'
  const split = text(input.split_by) ? `, split by ${GRAINS[String(input.split_by)] ?? input.split_by}` : ''
  const scope = [list(input.categories), list(input.subcategories), list(input.accounts)].filter(Boolean).join('; ')
  const filter = scope ? ` for ${scope}` : ''
  const note = text(input.note_contains) ? `, notes containing "${text(input.note_contains)}"` : ''
  return `${verb} ${what} by ${grain}${split}${filter}${note}${range(input)}`
}

/** What a tool call does, in words a user reads in the step list. */
export function describeToolCall(name: string, input: Record<string, unknown>): string {
  if (name === 'aggregate_transactions') return aggregateLabel(input)
  if (name === 'render_chart') return `Drawing "${text(input.title) ?? 'the chart'}"`
  if (name === 'get_category_spending') {
    return `Totalling ${text(input.category) ?? 'a category'}${range(input)}`
  }
  return FIXED[name] ?? `Looking up ${name.replaceAll('_', ' ')}`
}

/** A tool result the model has to correct: the API's or the validator's `{error}`. */
export function isToolError(result: unknown): boolean {
  return typeof result === 'object' && result !== null && 'error' in result
}
