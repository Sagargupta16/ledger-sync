/**
 * Pattern tables for `expenseClassification.ts`. Split out to keep that module
 * under the 250-line cap; read its header for the taxonomy rationale and the
 * multi-user constraint these patterns exist to satisfy.
 *
 * All patterns are word-boundary anchored and case-insensitive, and run against
 * text that has already been lowercased, whitespace-collapsed and had " and "
 * folded to "&". They see the row's `category` + `subcategory` only, never
 * `note` or `account`. Add a GENERIC signal here; never a single ledger's exact
 * category spelling.
 */

/**
 * A row's own taxonomy must look investment-related before any loss rule can
 * fire, so a consumption row filed under a category that happens to say "loss"
 * ("Card Loss Replacement") stays an expense.
 */
export const INVESTMENT_CONTEXT_PATTERNS: readonly RegExp[] = [
  /\binvest(?:ing|ment|ments)?\b/i,
  /\bstock(?:s)?\b/i,
  /\bshare(?:s)?\b/i,
  /\bequit(?:y|ies)\b/i,
  /\btrad(?:e|es|ing)\b/i,
  /\bf\s*&\s*o\b/i,
  /\bfno\b/i,
  /\bfuture(?:s)?\b/i,
  /\boption(?:s)?\b/i,
  /\bderivative(?:s)?\b/i,
  /\bintraday\b/i,
  /\bspeculative\b/i,
  /\bmutual\s*fund(?:s)?\b/i,
  /\bmf\b/i,
  /\betf(?:s)?\b/i,
  /\bsip\b/i,
  /\bdemat\b/i,
  // Bare "brokerage" is deliberately NOT an investment signal: "Housing
  // Brokerage/Subscriptions" (a rental agent) is ordinary consumption, and it
  // was being labelled an investment cost until this was narrowed. Securities
  // brokerage always carries a second signal (an "Investment"/"Stocks"
  // category) or one of the compounds below.
  /\b(?:stock|share|sub)[-\s]?broker(?:age)?\b/i,
  /\bportfolio\b/i,
  /\bsecurit(?:y|ies)\b/i,
  /\bbond(?:s)?\b/i,
  /\bdebenture(?:s)?\b/i,
  /\bcrypto(?:currency)?\b/i,
  /\bcapital\s*gain(?:s)?\b/i,
  /\b(?:lt|st)cg\b/i,
  /\bnps\b/i,
  // Retirement vehicles: bare PF plus the EPF / VPF / PPF spellings.
  /\b[evp]?pf\b/i,
]

/**
 * Realised-loss signals. Plural/singular and hyphen drift are covered by the
 * optional groups; do not tighten these to one ledger's exact spelling.
 */
export const CAPITAL_LOSS_PATTERNS: readonly RegExp[] = [
  /\bloss(?:es)?\b/i,
  /\bwrite[-\s]?off(?:s)?\b/i,
  /\bwritten[-\s]?off\b/i,
  /\bnegative\s*return(?:s)?\b/i,
]

/**
 * Cost-of-investing signals: real cash paid to participate in a market, so
 * still an expense. Checked BEFORE the loss rules, so a fee booked on a
 * loss-making trade stays in the spending total (the fail-safe direction).
 */
export const INVESTMENT_COST_PATTERNS: readonly RegExp[] = [
  /\bfee(?:s)?\b/i,
  /\bcharge(?:s)?\b/i,
  /\bcommission(?:s)?\b/i,
  /\bbrokerage\b/i,
  /\bstt\b/i,
  /\bsebi\b/i,
  /\bstamp\s*duty\b/i,
  /\bamc\b/i,
  /\bexpense\s*ratio\b/i,
  /\badvisor(?:y)?\b/i,
  /\bsubscription(?:s)?\b/i,
  /\btax(?:es)?\b/i,
]
