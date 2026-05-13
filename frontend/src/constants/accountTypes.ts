/**
 * Account type classification.
 *
 * Priority-ordered, word-boundary-based matching so that "HDFC CC" is a
 * credit card, "HDFC Bank" is a bank, and "HDFC Stocks" is an investment.
 * Substring matching (the old approach) collided on "invest" + "bank" for
 * names like "ICICI Investment Account" and missed "DEMAT" (uppercase).
 *
 * All matching is case-insensitive. Patterns use word boundaries so
 * "invest" won't match inside "investigation" and "rd" won't match inside
 * "credit card".
 */

export type AccountType = 'credit_card' | 'investment' | 'loan' | 'deposit'

// Ordered rules: first rule that matches wins. Order matters because many
// account names carry multiple signals (e.g. "HDFC Credit Card Loan" should
// be a credit card, not a loan).

export interface AccountTypeRule {
  readonly type: AccountType
  readonly patterns: readonly RegExp[]
  readonly label: string
}

const wb = (word: string): RegExp => new RegExp(String.raw`\b${word}\b`, 'i')

export const ACCOUNT_TYPE_RULES: readonly AccountTypeRule[] = [
  {
    type: 'credit_card',
    label: 'Credit Card',
    patterns: [
      /\bcredit\s*card\b/i,
      /\bcc\b/i,
      /\bvisa\b/i,
      /\bmaster\s*card\b/i,
      /\bmastercard\b/i,
      /\bamex\b/i,
      /\brupay\s*(?:credit)?\b/i,
      /\bdiners\b/i,
    ],
  },
  {
    type: 'investment',
    label: 'Investment',
    patterns: [
      wb('invest'),
      wb('investment'),
      wb('investments'),
      wb('mutual'),
      wb('mf'),
      wb('sip'),
      wb('stock'),
      wb('stocks'),
      wb('equity'),
      wb('equities'),
      wb('share'),
      wb('shares'),
      wb('demat'),
      wb('portfolio'),
      wb('brokerage'),
      wb('broker'),
      wb('fund'),
      wb('funds'),
      wb('nps'),
      wb('ppf'),
      wb('epf'),
      wb('vpf'),
      wb('ssy'),        // Sukanya Samriddhi
      wb('nsc'),
      wb('bonds'),
      wb('rsu'),
      wb('rsus'),
      wb('esop'),
      wb('espp'),
      // Broker / app names (word boundary; case-insensitive)
      wb('zerodha'),
      wb('groww'),
      wb('grow'),
      wb('upstox'),
      wb('kite'),
      wb('indmoney'),
      /\bind\s*money\b/i,
      wb('coin'),
      wb('smallcase'),
      wb('paytmmoney'),
      /\bpaytm\s*money\b/i,
      wb('kuvera'),
      wb('etmoney'),
      /\bet\s*money\b/i,
    ],
  },
  {
    type: 'loan',
    label: 'Loan',
    patterns: [
      wb('loan'),
      wb('loans'),
      wb('mortgage'),
      wb('emi'),
      wb('debt'),
      wb('borrowed'),
      wb('lending'),
      wb('lended'),
      /\bhome\s*loan\b/i,
      /\bcar\s*loan\b/i,
      /\bpersonal\s*loan\b/i,
      /\beducation\s*loan\b/i,
      /\bgold\s*loan\b/i,
    ],
  },
  {
    type: 'deposit',
    label: 'Bank / Deposit',
    patterns: [
      wb('savings'),
      wb('saving'),
      wb('current'),
      wb('checking'),
      wb('chequing'),
      /\bfixed\s*deposit\b/i,
      wb('fd'),
      /\brecurring\s*deposit\b/i,
      wb('rd'),
      wb('deposit'),
      wb('bank'),
      wb('account'),
      wb('wallet'),
      wb('cash'),
      wb('upi'),
      wb('paytm'),
      wb('phonepe'),
      wb('gpay'),
    ],
  },
]

/**
 * Classify an account name into a type, using priority order. Returns
 * `null` if no rule matches -- caller should treat that as "unclassified"
 * rather than forcing a bucket.
 */
export const inferAccountType = (accountName: string): AccountType | null => {
  const name = accountName.trim()
  if (!name) return null
  for (const rule of ACCOUNT_TYPE_RULES) {
    if (rule.patterns.some((pattern) => pattern.test(name))) {
      return rule.type
    }
  }
  return null
}

/**
 * Back-compat helper for callers that want a boolean "is this an
 * investment?" check. Returns true only if the top-priority classifier
 * lands on 'investment' -- so "HDFC CC" returns false even if it contains
 * the word "CC" (credit card wins).
 */
export const isInvestmentAccount = (accountName: string): boolean =>
  inferAccountType(accountName) === 'investment'
