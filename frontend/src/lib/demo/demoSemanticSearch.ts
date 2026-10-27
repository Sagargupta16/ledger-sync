/**
 * Demo twin of `GET /api/semantic-search/status` and `GET /api/semantic-search`
 * (backend `api/semantic_search.py`), answered by `resolveDemoSemanticSearch`.
 *
 * The demo has no Bedrock, so it ranks rows by character-trigram cosine over
 * the same "note | category | subcategory | account" text the backend embeds.
 * That finds shared words and near spellings rather than meaning, which is why
 * the model is reported as `demo-text-similarity`. Every demo row counts as
 * indexed, and the page filters narrow the rows before ranking, as on the
 * server. Only type imports from the services layer: `services/api/client.ts`
 * imports this module.
 */

import type {
  SemanticSearchHit,
  SemanticSearchResults,
  SemanticSearchStatus,
} from '@/services/api/semanticSearch'
import type { Transaction } from '@/types'

import { filterDemoTransactions } from './demoTxFilters'

export const DEMO_SEMANTIC_MODEL = 'demo-text-similarity'
const DEFAULT_LIMIT = 25
const MAX_LIMIT = 100

type Grams = Map<string, number>
const gramCache = new WeakMap<Transaction, { grams: Grams; norm: number }>()

function embeddingText(tx: Transaction): string {
  return [tx.note, tx.category, tx.subcategory, tx.account]
    .map((part) => (part ?? '').trim().split(/\s+/).join(' '))
    .filter(Boolean)
    .join(' | ')
}

function trigrams(text: string): { grams: Grams; norm: number } {
  const grams: Grams = new Map()
  for (const word of text.toLowerCase().split(/[^\p{L}\p{N}]+/u)) {
    if (!word) continue
    const padded = ` ${word} `
    for (let i = 0; i + 3 <= padded.length; i += 1) {
      const gram = padded.slice(i, i + 3)
      grams.set(gram, (grams.get(gram) ?? 0) + 1)
    }
  }
  let sum = 0
  for (const count of grams.values()) sum += count * count
  return { grams, norm: Math.sqrt(sum) }
}

function rowGrams(tx: Transaction) {
  let cached = gramCache.get(tx)
  if (!cached) {
    cached = trigrams(embeddingText(tx))
    gramCache.set(tx, cached)
  }
  return cached
}

function cosine(query: { grams: Grams; norm: number }, row: { grams: Grams; norm: number }): number {
  if (query.norm === 0 || row.norm === 0) return 0
  let dot = 0
  for (const [gram, count] of query.grams) dot += count * (row.grams.get(gram) ?? 0)
  return dot / (query.norm * row.norm)
}

function demoStatus(txs: Transaction[]): SemanticSearchStatus {
  return {
    available: true,
    reason: null,
    message: null,
    funding: 'app',
    model: DEMO_SEMANTIC_MODEL,
    dimensions: 0,
    region: 'demo',
    total: txs.length,
    indexed: txs.length,
    pending: 0,
    batch_size: 64,
    daily_token_limit: null,
    tokens_today: 0,
  }
}

function demoSearch(txs: Transaction[], params: Record<string, unknown>): SemanticSearchResults {
  const text = typeof params.q === 'string' ? params.q.trim().split(/\s+/).join(' ') : ''
  const requested = Number(params.limit)
  const limit = Number.isInteger(requested) && requested >= 1 ? Math.min(requested, MAX_LIMIT) : DEFAULT_LIMIT
  const query = trigrams(text)
  // `query` is the regular text filter; smart search ranks by `q` instead.
  const rows = filterDemoTransactions(txs, { ...params, query: undefined })
  const results: SemanticSearchHit[] = rows
    .map((transaction) => ({ transaction, score: Math.round(cosine(query, rowGrams(transaction)) * 1e4) / 1e4 }))
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score || a.transaction.id.localeCompare(b.transaction.id))
    .slice(0, limit)
  return { query: text, results, indexed: txs.length, model: DEMO_SEMANTIC_MODEL }
}

/** One DEMO_ROUTES entry for both GET routes under `/api/semantic-search`. */
export function resolveDemoSemanticSearch(
  txs: Transaction[],
  params: Record<string, unknown>,
  url: string,
): SemanticSearchStatus | SemanticSearchResults {
  return url.includes('/api/semantic-search/status') ? demoStatus(txs) : demoSearch(txs, params)
}
