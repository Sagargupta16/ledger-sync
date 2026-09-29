/**
 * GST rate lookup: resolves a category/subcategory label to a GST slab rate
 * and back-calculates GST from a GST-inclusive amount.
 *
 * Split out of `gstCalculator.ts`, which re-exports everything here so
 * importers keep using `@/lib/gstCalculator`.
 */

import { DEFAULT_GST_RATES, getRateTableForDate } from './gstRates'

/** Default rate for categories not in the mapping */
const DEFAULT_UNMAPPED_RATE = 18

/** Split a label into lowercase word tokens ("Food & Dining" -> [food, dining]). */
function wordTokens(label: string): string[] {
  return label
    .toLowerCase()
    // Possessive "'s" is not a word: "Gold's Gym" must tokenize to [gold, gym],
    // not [gold, s, gym].
    .replaceAll(/['’]s\b/g, '')
    .split(/[^a-z0-9]+/)
    .filter(Boolean)
    .map(singularToken)
}

/** Fold a simple plural so "Gift" meets the "Gifts" key and "Fees" meets "Fee". */
function singularToken(word: string): string {
  return word.length > 3 && word.endsWith('s') && !/(?:ss|us|is)$/.test(word)
    ? word.slice(0, -1)
    : word
}

/**
 * Per-rate-table caches, keyed by table object identity. computeGSTAnalysis
 * calls matchRate once per transaction (7k tx x ~100 table keys), so without
 * caching the table is re-lowercased/re-tokenized ~700k times per analysis.
 * The rate tables are module constants (or a stable customRates object), so a
 * WeakMap keyed on the table keeps this allocation-free across calls.
 */
interface TableCache {
  /** lowercased key -> rate, for the exact-match pass */
  exact: Map<string, number>
  /** tokenized keys in insertion order, for the word-boundary pass */
  tokenized: Array<{ words: string[]; rate: number }>
  /** memoized resolution: lowercased label -> rate (null = no match) */
  resolved: Map<string, number | null>
}

const tableCaches = new WeakMap<Record<string, number>, TableCache>()

function cacheFor(rates: Record<string, number>): TableCache {
  let cache = tableCaches.get(rates)
  if (!cache) {
    cache = {
      exact: new Map(
        Object.entries(rates).map(([k, r]) => [k.toLowerCase(), r]),
      ),
      tokenized: Object.entries(rates).map(([k, r]) => ({
        words: wordTokens(k),
        rate: r,
      })),
      resolved: new Map(),
    }
    tableCaches.set(rates, cache)
  }
  return cache
}

/**
 * Get the GST rate for a label (case-insensitive match).
 * Tries exact match first, then WORD-BOUNDARY containment against known keys.
 *
 * The fallback compares whole word sequences, not raw substrings: a bare
 * substring test made short keys false-positive traps ("Bus" matched
 * "Business" -> 5% instead of 18%, "Train" matched "Training", "Gold"
 * matched "Gold's Gym"). A key matches only when its full word sequence
 * appears as consecutive whole words in the label (or vice versa), so
 * "Public Transport" still matches a "Public Transport Pass" label while
 * "Business Services" no longer trips the "Bus" key. Among several matching
 * keys the longest wins (see `bestContainmentRate`).
 */
function matchRate(
  label: string,
  rates: Record<string, number>,
): number | null {
  const cache = cacheFor(rates)
  const lower = label.toLowerCase()

  const memo = cache.resolved.get(lower)
  if (memo !== undefined) return memo

  // Exact match (case-insensitive), else word-boundary containment.
  const exact = cache.exact.get(lower)
  const result = exact ?? bestContainmentRate(wordTokens(label), cache.tokenized)

  cache.resolved.set(lower, result)
  return result
}

/**
 * Word-boundary containment (key words appear consecutively in the label, or
 * label words in the key), choosing the match that covers the MOST words.
 * First-in-table-order let a short key win: "Gold" (3%) beat "Gym" in "Gold's
 * Gym". On a tie the higher rate wins: a zero-rated person key ("Friends",
 * "Family") next to a taxed purchase ("Dining with Friends", "Gift for Family")
 * describes the purchase, not a money transfer.
 */
function bestContainmentRate(
  labelWords: string[],
  tokenized: ReadonlyArray<{ words: string[]; rate: number }>,
): number | null {
  let best: { length: number; rate: number } | null = null
  for (const { words: keyWords, rate } of tokenized) {
    let length = 0
    if (containsSequence(labelWords, keyWords)) length = keyWords.length
    else if (containsSequence(keyWords, labelWords)) length = labelWords.length
    if (length === 0) continue
    if (best === null || length > best.length || (length === best.length && rate > best.rate)) {
      best = { length, rate }
    }
  }
  return best?.rate ?? null
}

/** True when `needle` appears as a consecutive run inside `haystack`. */
function containsSequence(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer
    }
    return true
  }
  return false
}

/**
 * Get the GST rate for a transaction.
 * Tries subcategory first (more specific), then category, then default.
 *
 * `forDate` selects the GST 2.0 vs legacy rate table (ignored when customRates
 * is supplied). Defaults to the current (post-reform) table.
 */
export function getGSTRate(
  category: string,
  subcategory?: string,
  customRates?: Record<string, number>,
  forDate?: string,
): number {
  const rates = customRates ?? (forDate ? getRateTableForDate(forDate).rates : DEFAULT_GST_RATES)

  // Try subcategory first (e.g. "Rent" under "Housing" → 0%)
  if (subcategory) {
    const subRate = matchRate(subcategory, rates)
    if (subRate !== null) return subRate
  }

  // Fall back to category
  const catRate = matchRate(category, rates)
  if (catRate !== null) return catRate

  return DEFAULT_UNMAPPED_RATE
}

/**
 * Calculate GST from a GST-inclusive amount.
 * GST = amount × rate / (100 + rate)
 */
export function calculateGSTFromInclusive(amount: number, ratePercent: number): number {
  if (ratePercent <= 0) return 0
  return (amount * ratePercent) / (100 + ratePercent)
}
