/**
 * The canvas survives a reload in the same tab: charts live in sessionStorage
 * under the signed-in user's id, so closing the tab drops them and another
 * account in the tab never sees them. Every stored chart is validated again on
 * load; anything that no longer parses is dropped.
 */

import { chartArgs, parseChartArgs, type CanvasChart } from './chartSpec'

export const MAX_CANVAS_CHARTS = 12

export function canvasStorageKey(userId: number | null): string | null {
  return userId === null ? null : `ledger-sync:ai-canvas:v1:${userId}`
}

interface StoredChart {
  id: string
  prompt: string
  createdAt: string
  args: Record<string, unknown>
}

function restore(value: unknown): CanvasChart | null {
  if (typeof value !== 'object' || value === null) return null
  const stored = value as Partial<StoredChart>
  if (typeof stored.id !== 'string' || typeof stored.prompt !== 'string') return null
  if (typeof stored.createdAt !== 'string' || typeof stored.args !== 'object' || stored.args === null) {
    return null
  }
  const parsed = parseChartArgs(stored.args)
  return parsed.ok
    ? { id: stored.id, prompt: stored.prompt, createdAt: stored.createdAt, spec: parsed.spec }
    : null
}

export function loadCanvas(key: string | null): CanvasChart[] {
  if (!key) return []
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(key) ?? '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(restore)
      .filter((chart): chart is CanvasChart => chart !== null)
      .slice(0, MAX_CANVAS_CHARTS)
  } catch {
    // Unreadable or blocked storage starts an empty canvas.
    return []
  }
}

function toStored(chart: CanvasChart): StoredChart {
  return { id: chart.id, prompt: chart.prompt, createdAt: chart.createdAt, args: chartArgs(chart.spec) }
}

export function saveCanvas(key: string | null, charts: readonly CanvasChart[]): void {
  if (!key) return
  try {
    if (charts.length === 0) sessionStorage.removeItem(key)
    else sessionStorage.setItem(key, JSON.stringify(charts.map(toStored)))
  } catch {
    // Full or blocked storage: the canvas still works for this visit.
  }
}
