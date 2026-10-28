/**
 * Argument readers for `render_chart` (chartSpec.ts). Each throws a
 * ChartArgError whose message is written for the model to read and act on.
 */

export class ChartArgError extends Error {}

export function fail(message: string): never {
  throw new ChartArgError(message)
}

export function asRecord(value: unknown, field: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

export function text(value: unknown, field: string, max: number): string {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  if (!trimmed) fail(`${field} must be a non-empty string`)
  if (trimmed.length > max) fail(`${field} must be at most ${max} characters`)
  return trimmed
}

export function optionalText(value: unknown, field: string, max: number): string | undefined {
  return value === undefined || value === null || value === '' ? undefined : text(value, field, max)
}

export function oneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T {
  if (typeof value === 'string' && (allowed as readonly string[]).includes(value)) return value as T
  return fail(`${field} must be one of ${allowed.join(', ')}`)
}

export function optionalOneOf<T extends string>(value: unknown, allowed: readonly T[], field: string): T | undefined {
  return value === undefined || value === null ? undefined : oneOf(value, allowed, field)
}

export function toNumber(value: unknown, field: string): number {
  const number = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  if (typeof number !== 'number' || !Number.isFinite(number)) fail(`${field} must be a number`)
  return number
}

/** Unique labels, `min` to `max` of them; `hint` says what to do with too many. */
export function parseLabels(value: unknown, min: number, max: number, labelMax: number, hint: string): string[] {
  if (!Array.isArray(value) || value.length === 0) fail('labels must list at least one label')
  if (value.length < min) fail(`labels has ${value.length} entries; this chart needs at least ${min}`)
  if (value.length > max) fail(`labels has ${value.length} entries; this chart takes at most ${max}${hint}`)
  const seen = new Set<string>()
  return value.map((entry: unknown, index) => {
    const label =
      typeof entry === 'number' && Number.isFinite(entry) ? String(entry) : text(entry, `labels[${index}]`, labelMax)
    if (seen.has(label)) fail(`labels has "${label}" twice; each label must be unique`)
    seen.add(label)
    return label
  })
}

export interface RawSeries {
  label: string
  values: number[]
  kind?: 'bar' | 'line'
  axis?: 'left' | 'right'
}

const KINDS = ['bar', 'line'] as const
const AXES = ['left', 'right'] as const

/** `min` to `max` series, each with one number per label. */
export function parseSeries(
  value: unknown,
  rows: number,
  { min, max, labelMax, what }: { min: number; max: number; labelMax: number; what: string },
): RawSeries[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    fail(min === max ? `${what} takes exactly ${min} series` : `${what} takes ${min} to ${max} series`)
  }
  return value.map((entry: unknown, index) => {
    const item = asRecord(entry, `series[${index}]`)
    const label = text(item.label, `series[${index}].label`, labelMax)
    if (!Array.isArray(item.values) || item.values.length !== rows) {
      fail(`series[${index}].values must hold ${rows} numbers, one per label`)
    }
    const values = item.values.map((v: unknown, at) => toNumber(v, `series[${index}].values[${at}]`))
    const kind = optionalOneOf(item.kind, KINDS, `series[${index}].kind`)
    const axis = optionalOneOf(item.axis, AXES, `series[${index}].axis`)
    return { label, values, ...(kind ? { kind } : {}), ...(axis ? { axis } : {}) }
  })
}

export interface RawLink {
  from: string
  to: string
  value: number
}

function findCycle(links: readonly RawLink[]): string[] | null {
  const next = new Map<string, string[]>()
  for (const link of links) next.set(link.from, [...(next.get(link.from) ?? []), link.to])
  const state = new Map<string, 'open' | 'done'>()
  const path: string[] = []
  const visit = (node: string): string[] | null => {
    if (state.get(node) === 'done') return null
    if (state.get(node) === 'open') return [...path.slice(path.indexOf(node)), node]
    state.set(node, 'open')
    path.push(node)
    for (const target of next.get(node) ?? []) {
      const cycle = visit(target)
      if (cycle) return cycle
    }
    path.pop()
    state.set(node, 'done')
    return null
  }
  for (const node of next.keys()) {
    const cycle = visit(node)
    if (cycle) return cycle
  }
  return null
}

/** Sankey links: positive, one way, no repeated pair, at most `maxNodes` distinct nodes. */
export function parseLinks(
  value: unknown,
  { max, maxNodes, labelMax }: { max: number; maxNodes: number; labelMax: number },
): RawLink[] {
  if (!Array.isArray(value) || value.length === 0) fail('a sankey needs links: [{from, to, value}]')
  if (value.length > max) fail(`links has ${value.length} entries; a sankey takes at most ${max}, so merge the small flows`)
  const pairs = new Set<string>()
  const links = value.map((entry: unknown, index) => {
    const item = asRecord(entry, `links[${index}]`)
    const from = text(item.from, `links[${index}].from`, labelMax)
    const to = text(item.to, `links[${index}].to`, labelMax)
    if (from === to) fail(`links[${index}] goes from "${from}" to itself`)
    const amount = toNumber(item.value, `links[${index}].value`)
    if (amount <= 0) fail(`links[${index}].value must be above zero; leave out empty flows`)
    const pair = `${from}\u0000${to}`
    if (pairs.has(pair)) fail(`links has "${from}" to "${to}" twice; combine them into one link`)
    pairs.add(pair)
    return { from, to, value: amount }
  })
  const nodes = new Set(links.flatMap((link) => [link.from, link.to]))
  if (nodes.size > maxNodes) fail(`links name ${nodes.size} nodes; a sankey takes at most ${maxNodes}, so group the small ones`)
  const cycle = findCycle(links)
  if (cycle) fail(`links form a cycle (${cycle.join(' to ')}); a sankey must flow one way`)
  return links
}
