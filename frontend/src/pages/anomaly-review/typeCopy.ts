/**
 * What each anomaly type means and what the user can do about it.
 *
 * The explanation says what the detector checked; the two review labels name
 * the two outcomes of `POST /anomalies/{id}/review` (`dismiss: false` keeps the
 * finding as reviewed, `dismiss: true` marks it not a problem). When the user
 * typed no note, the chosen label is stored as the note, so a reviewed card
 * still says what was decided.
 */

import { ROUTES } from '@/constants'
import type { Anomaly, AnomalyTypeValue } from '@/services/api/analyticsV2Anomalies'

export interface ReviewCopy {
  readonly explanation: string
  readonly review: string
  readonly dismiss: string
  /** Store the button label as the note when none was typed. */
  readonly recordChoice: boolean
  /** Where the fix happens, when a page owns it. */
  readonly link?: { readonly to: string; readonly label: string }
}

/**
 * One entry per type, declared in display priority: money leaks first, then
 * commitments, then spending baselines (`ANOMALY_TYPE_ORDER` reads this order).
 */
const COPY: Record<AnomalyTypeValue, ReviewCopy> = {
  duplicate_suspected: {
    explanation:
      'Same account, amount and note within 3 days, and this payee does not usually repeat that fast.',
    review: 'Duplicate',
    dismiss: 'Not a duplicate',
    recordChoice: true,
  },
  fee_charge: {
    explanation:
      'Late fee, finance charge or card interest, forex markup or card annual fee, found in the category or note.',
    review: 'Noted',
    dismiss: 'Not a fee',
    recordChoice: true,
  },
  missing_recurring: {
    explanation:
      'A commitment you confirmed has no matching entry past its usual window, though the account has newer rows.',
    // A review asks again when the next entry is missed too; a dismissal stays
    // quiet until the commitment is paid again (`anomaly_recurring.py`).
    review: 'Still expected',
    dismiss: 'Ended or paid elsewhere',
    recordChoice: true,
    link: { to: ROUTES.SUBSCRIPTIONS, label: 'Manage commitments' },
  },
  budget_exceeded: {
    explanation: "This month's spending in the category passed its budget.",
    review: 'Review',
    dismiss: 'Dismiss',
    recordChoice: false,
    link: { to: ROUTES.BUDGETS, label: 'Open budgets' },
  },
  closed_account_activity: {
    explanation: 'A row dated after the account was marked closed.',
    review: 'Review',
    dismiss: 'Dismiss',
    recordChoice: false,
    link: { to: ROUTES.SETTINGS, label: 'Closed accounts' },
  },
  large_transfer: {
    explanation: 'Far larger than what this account usually sends, over the last 12 months.',
    review: 'Noted',
    dismiss: 'Expected',
    recordChoice: true,
  },
  unusual_category: {
    explanation: "This category's month is far above its typical month over the last year.",
    review: 'Noted',
    dismiss: 'Expected',
    recordChoice: true,
    link: { to: ROUTES.SPENDING_ANALYSIS, label: 'See spending' },
  },
  high_expense: {
    explanation: 'A month, or one expense, well above your own trailing 12-month baseline.',
    review: 'Review',
    dismiss: 'Dismiss',
    recordChoice: false,
  },
}

/** Every type in display priority, complete because `COPY` is an exhaustive record. */
export const ANOMALY_TYPE_ORDER = Object.keys(COPY) as readonly AnomalyTypeValue[]

const FALLBACK: ReviewCopy = {
  explanation: 'An unusual pattern in your ledger.',
  review: 'Review',
  dismiss: 'Dismiss',
  recordChoice: false,
}

/** Copy for a wire `anomaly_type`, neutral for one this build does not know. */
export function reviewCopy(type: Anomaly['anomaly_type']): ReviewCopy {
  return COPY[type] ?? FALLBACK
}

const UNUSUAL_CATEGORY_PREFIX = 'Unusual spending in '

/**
 * Link target for a card. An unusual-category description carries its category
 * between a fixed prefix and the last ': ' (`anomaly_rules.described` on the
 * backend), so that link opens Spending on the category.
 */
export function reviewLink(anomaly: Anomaly): ReviewCopy['link'] {
  const link = reviewCopy(anomaly.anomaly_type).link
  if (!link || anomaly.anomaly_type !== 'unusual_category') return link
  const rest = anomaly.description.startsWith(UNUSUAL_CATEGORY_PREFIX)
    ? anomaly.description.slice(UNUSUAL_CATEGORY_PREFIX.length)
    : ''
  const cut = rest.lastIndexOf(': ')
  if (cut <= 0) return link
  return { ...link, to: `${link.to}?category=${encodeURIComponent(rest.slice(0, cut))}` }
}

export function typeRank(type: Anomaly['anomaly_type']): number {
  const rank = ANOMALY_TYPE_ORDER.indexOf(type)
  return rank === -1 ? ANOMALY_TYPE_ORDER.length : rank
}
