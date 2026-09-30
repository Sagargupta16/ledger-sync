/**
 * Shared metric-definition predicates, the frontend twin of backend
 * `core/metric_rules.py` (owner decisions, 2026-09-30). Change a rule in both
 * places or the pages drift from the server rollups again.
 *
 * Nothing here names one user's accounts or categories: defaults are generic
 * word-boundary keywords and every user list is matched as the user wrote it.
 */

const escapeRegExp = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

/**
 * Case-insensitive whole-word test for any of `phrases`, the JS twin of the
 * backend's `re.search(rf"\b{re.escape(p)}\b", text)`: "rd" never matches inside
 * "weird" and "education" still matches "Education & Learning". `null` when no
 * phrase is non-blank.
 */
export function phrasePattern(phrases: Iterable<string>): RegExp | null {
  const words = [...phrases].map((phrase) => phrase.trim()).filter(Boolean)
  if (words.length === 0) return null
  return new RegExp(String.raw`\b(?:${words.map(escapeRegExp).join('|')})\b`, 'i')
}

// ─── essentials (Needs) ─────────────────────────────────────────────────────

/** Built-in Needs keywords, backend `DEFAULT_NEEDS`. The user's list ADDS to these. */
export const DEFAULT_NEEDS_KEYWORDS: readonly string[] = [
  'rent', 'housing', 'home loan', 'home-loan', 'emi', 'utilities', 'electricity', 'water',
  'gas', 'cooking gas', 'cylinder', 'groceries', 'grocery', 'food', 'food & dining', 'fuel',
  'petrol', 'diesel', 'transport', 'transportation', 'commute', 'insurance',
  'health insurance', 'life insurance', 'healthcare', 'medical', 'medicine', 'doctor',
  'hospital', 'education', 'school fees', 'tuition', 'family support', 'family', 'parents',
  'internet', 'broadband', 'phone', 'mobile', 'recharge',
]

// One compiled pattern per essential list; a breakdown classifies every row.
const needsPatterns = new WeakMap<readonly string[], RegExp | null>()

const needsPatternFor = (essentialCategories: readonly string[]): RegExp | null => {
  if (!needsPatterns.has(essentialCategories)) {
    needsPatterns.set(essentialCategories, phrasePattern([...DEFAULT_NEEDS_KEYWORDS, ...essentialCategories]))
  }
  return needsPatterns.get(essentialCategories) ?? null
}

/**
 * The Needs predicate, backend `is_essential_expense`: the built-in keywords
 * plus the user's essential list, case-insensitive at word boundaries on the
 * category OR the subcategory.
 */
export function isEssentialExpense(
  category: string | null | undefined,
  subcategory: string | null | undefined,
  essentialCategories: readonly string[],
): boolean {
  const pattern = needsPatternFor(essentialCategories)
  return pattern !== null && (pattern.test(category ?? '') || pattern.test(subcategory ?? ''))
}

// ─── salary vs bonus ────────────────────────────────────────────────────────

export type EmploymentIncomeKind = 'salary' | 'bonus'

const SALARY_PATTERN = /\b(?:salary|stipends?)\b/i
const BONUS_PATTERN = /\b(?:bonus(?:es)?|rsus?)\b/i

const employmentKindOf = (text: string): EmploymentIncomeKind | null => {
  if (BONUS_PATTERN.test(text)) return 'bonus'
  return SALARY_PATTERN.test(text) ? 'salary' : null
}

/**
 * Salary vs bonus split for an already-taxable income row: the keywords salary,
 * stipend, bonus/bonuses and rsu/rsus, case-insensitive at word boundaries on
 * the key, subcategory first. "Employment Income::Monthly Salary" and
 * "Salary::Monthly" are salary; "Salary::Performance Bonus" is a bonus.
 */
export function classifyEmploymentIncome(row: {
  category?: string | null
  subcategory?: string | null
}): EmploymentIncomeKind | null {
  return employmentKindOf(row.subcategory ?? '') ?? employmentKindOf(row.category ?? '')
}
