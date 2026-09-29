/**
 * Write steps of the Settings save, split out of `useSettingsState` so the hook
 * keeps only state and sequencing. Every step asserts the captured session
 * after each await, exactly as the inline code did.
 */

import type { Dispatch, SetStateAction } from 'react'

import { accountClassificationsService } from '@/services/api/accountClassifications'
import {
  categorizationRulesService,
  type CategorizationRule,
  type CategorizationRuleInput,
} from '@/services/api/categorizationRules'
import { assertCurrentSession } from '@/lib/session'

import type { LocalRule } from './types'
import { normalizeArray } from './helpers'

/** True when a saved rule differs from its draft (or no longer exists on the server). */
function ruleChanged(server: CategorizationRule | undefined, rule: LocalRule, sortOrder: number): boolean {
  if (server === undefined) return true
  return (
    server.match_field !== rule.match_field ||
    server.pattern !== rule.pattern ||
    server.category !== rule.category ||
    server.subcategory !== rule.subcategory ||
    server.is_active !== rule.is_active ||
    server.sort_order !== sortOrder
  )
}

export async function settleWrites(writes: Promise<unknown>[]): Promise<void> {
  const results = await Promise.allSettled(writes)
  const failure = results.find((result) => result.status === 'rejected')
  if (failure?.status === 'rejected') throw failure.reason
}

function createdRuleIdUpdater(localId: string, id: number) {
  return (current: LocalRule[]) => current.map((item) =>
    item.localId === localId ? { ...item, id } : item,
  )
}

/** Write only the account classifications that differ from the server's map. */
export async function writeChangedClassifications(
  classifications: Record<string, string>,
  signal: AbortSignal,
): Promise<void> {
  const original = await accountClassificationsService.getAllClassifications()
  assertCurrentSession(signal)
  const changed = Object.entries(classifications).filter(
    ([name, type]) => original[name] !== type,
  )
  await settleWrites(
    changed.map(([name, type]) => accountClassificationsService.setClassification(name, type)),
  )
  assertCurrentSession(signal)
}

/** Sync categorization rules: diff local rows against the server list. */
export async function syncCategorizationRules(
  rules: LocalRule[],
  signal: AbortSignal,
  setRules: Dispatch<SetStateAction<LocalRule[]>>,
): Promise<void> {
  const serverRules = await categorizationRulesService.getRules()
  assertCurrentSession(signal)
  const serverById = new Map(serverRules.map((r) => [r.id, r]))
  const localIds = new Set(rules.filter((r) => r.id !== undefined).map((r) => r.id))
  const ruleOps: Promise<unknown>[] = []
  rules.forEach((rule, idx) => {
    const input: CategorizationRuleInput = {
      match_field: rule.match_field,
      pattern: rule.pattern,
      category: rule.category,
      subcategory: rule.subcategory || null,
      is_active: rule.is_active,
      sort_order: idx,
    }
    if (rule.id === undefined) {
      ruleOps.push(categorizationRulesService.createRule(input).then((created) => {
        assertCurrentSession(signal)
        // Preserve successful creates if another write fails, so retrying
        // the retained draft updates this rule instead of creating it twice.
        setRules(createdRuleIdUpdater(rule.localId, created.id))
      }))
      return
    }
    if (ruleChanged(serverById.get(rule.id), rule, idx)) {
      ruleOps.push(categorizationRulesService.updateRule(rule.id, input))
    }
  })
  for (const server of serverRules) {
    if (!localIds.has(server.id)) ruleOps.push(categorizationRulesService.deleteRule(server.id))
  }
  await settleWrites(ruleOps)
  assertCurrentSession(signal)
}

/** Editable rows for the refreshed server rules. */
export function toLocalRules(serverRules: CategorizationRule[]): LocalRule[] {
  return serverRules.map((r) => ({
    localId: String(r.id),
    id: r.id,
    match_field: r.match_field,
    pattern: r.pattern,
    category: r.category,
    subcategory: r.subcategory,
    is_active: r.is_active,
  }))
}

/**
 * Whether the draft's excluded accounts differ, as a set, from the saved ones.
 * Of all settings only this list changes the ledger rows `/transactions/all`
 * returns, so it alone decides whether a save re-downloads the ledger. Unknown
 * saved state counts as changed.
 */
export function excludedAccountsChanged(
  draft: string[] | string,
  saved: string[] | string | undefined,
): boolean {
  if (saved === undefined) return true
  const next = new Set(normalizeArray(draft))
  const previous = new Set(normalizeArray(saved))
  return next.size !== previous.size || [...next].some((name) => !previous.has(name))
}
