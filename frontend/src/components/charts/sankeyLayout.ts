/**
 * Pure Sankey layout for the chart kit; no DOM, no dependencies. Columns come from the longest path
 * out of the sources, one vertical scale fits the fullest column, relaxation pulls nodes toward the
 * value-weighted centre of their neighbours, and links stack by their far ends to cut crossings.
 */

export interface SankeyNodeInput { readonly id: string; readonly label: string; readonly color?: string }

export interface SankeyLinkInput {
  readonly source: string; readonly target: string; readonly value: number; readonly color?: string
  /** Identity across data changes, so the link morphs; defaults to `source->target`. */
  readonly id?: string
}

/** Defaults: nodeWidth 12, nodePadding 14 (capped so a column's gaps take at most half the height), iterations 6. */
export interface SankeyLayoutOptions {
  readonly width: number; readonly height: number
  readonly nodeWidth?: number; readonly nodePadding?: number; readonly iterations?: number
  /** `justify` (default) moves nodes without outflow to the last column; `left` keeps them at their depth. */
  readonly align?: 'justify' | 'left'
}

/** A vertical extent in px from the top of the layout box. */
export interface SankeySpan { y0: number; y1: number }

/**
 * Added to each node, in px inside the layout box. `value` is the larger of inflow and outflow,
 * `depth` the longest path from a source, `column` its depth or, for a `justify` sink, the last column.
 */
export interface SankeyNodeBox extends SankeySpan { x0: number; x1: number; value: number; depth: number; column: number }

/**
 * Added to each link: an `id` unique and stable across data changes, so the link can morph; `x0`/`x1`
 * the source's right and the target's left edge; `y0`/`y1` the ribbon centre at each end.
 */
export interface SankeyLinkBox { id: string; x0: number; x1: number; y0: number; y1: number; width: number }

export type SankeyNode<N extends SankeyNodeInput = SankeyNodeInput> = N & SankeyNodeBox
export type SankeyLink<L extends SankeyLinkInput = SankeyLinkInput> = L & SankeyLinkBox

/** The laid-out graph. Nodes left without a positive link are dropped. */
export interface SankeyLayout<N extends SankeyNodeInput = SankeyNodeInput, L extends SankeyLinkInput = SankeyLinkInput> {
  readonly nodes: SankeyNode<N>[]
  readonly links: SankeyLink<L>[]
  readonly columns: number
}

interface WorkNode extends SankeyNodeBox {
  readonly id: string; readonly order: number; readonly inLinks: WorkLink[]; readonly outLinks: WorkLink[]
}

interface WorkLink extends Omit<SankeyLinkBox, 'x0' | 'x1'> {
  readonly order: number; readonly value: number; readonly source: WorkNode; readonly target: WorkNode
}

const total = (items: readonly { value: number }[]) => items.reduce((sum, item) => sum + item.value, 0)
const centre = (span: SankeySpan) => (span.y0 + span.y1) / 2
const move = (span: SankeySpan, dy: number) => Object.assign(span, { y0: span.y0 + dy, y1: span.y1 + dy })
const fmt = (value: number) => (Number.isFinite(value) ? Math.round(value * 100) / 100 : 0)

/** Lays out a directed acyclic graph. Throws on a repeated node id, a link to a missing node or a cycle. */
export function computeSankeyLayout<N extends SankeyNodeInput, L extends SankeyLinkInput>(
  graph: { readonly nodes: readonly N[]; readonly links: readonly L[] },
  options: SankeyLayoutOptions,
): SankeyLayout<N, L> {
  const byId = new Map<string, WorkNode>()
  graph.nodes.forEach(({ id }, order) => {
    if (byId.has(id)) throw new Error(`Sankey node id "${id}" is used twice; node ids must be unique`)
    byId.set(id, { id, order, inLinks: [], outLinks: [], x0: 0, x1: 0, y0: 0, y1: 0, value: 0, depth: 0, column: 0 })
  })
  const links: WorkLink[] = []
  const repeats = new Map<string, number>()
  graph.links.forEach((input, order) => {
    if (!(input.value > 0 && Number.isFinite(input.value))) return // a zero, negative or non-finite flow has no width
    const source = byId.get(input.source)
    const target = byId.get(input.target)
    if (!source || !target) throw new Error(`Sankey link "${input.source}" -> "${input.target}" names a node that is not in nodes`)
    const key = input.id ?? `${input.source}->${input.target}`
    const seen = repeats.get(key) ?? 0
    repeats.set(key, seen + 1)
    const link = { id: seen ? `${key}#${seen}` : key, order, value: input.value, source, target, width: 0, y0: 0, y1: 0 }
    source.outLinks.push(link)
    target.inLinks.push(link)
    links.push(link)
  })
  const nodes = [...byId.values()].filter((node) => node.inLinks.length + node.outLinks.length > 0)
  for (const node of nodes) node.value = Math.max(total(node.inLinks), total(node.outLinks))
  const columns = toColumns(nodes, options.align ?? 'justify')
  if (columns.length > 0) place(columns, links, options)
  return {
    nodes: nodes.map(({ order, x0, x1, y0, y1, value, depth, column }) => ({ ...graph.nodes[order], x0, x1, y0, y1, value, depth, column })),
    links: links.map(({ order, id, source, target, y0, y1, width }) => ({ ...graph.links[order], id, x0: source.x1, x1: target.x0, y0, y1, width })),
    columns: columns.length,
  }
}

/** Depth by longest path in topological order (Kahn), then columns in input order. Throws on a cycle. */
function toColumns(nodes: WorkNode[], align: 'justify' | 'left'): WorkNode[][] {
  const waiting = new Map(nodes.map((node) => [node, node.inLinks.length]))
  const queue = nodes.filter((node) => node.inLinks.length === 0)
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index]
    for (const { target } of node.outLinks) {
      target.depth = Math.max(target.depth, node.depth + 1)
      const left = (waiting.get(target) ?? 0) - 1
      waiting.set(target, left)
      if (left === 0) queue.push(target)
    }
  }
  const stuck = nodes.find((node) => (waiting.get(node) ?? 0) > 0)
  if (stuck) throw new Error(`Sankey links form a cycle at or upstream of node "${stuck.id}"; the graph must be acyclic`)
  const last = Math.max(0, ...nodes.map((node) => node.depth))
  const columns = nodes.length > 0 ? Array.from({ length: last + 1 }, (): WorkNode[] => []) : []
  for (const node of nodes) {
    node.column = align === 'justify' && node.outLinks.length === 0 ? last : node.depth
    columns[node.column].push(node)
  }
  return columns
}

/** Scales and stacks the columns, relaxes them, then stacks every node's links. */
function place(columns: WorkNode[][], links: WorkLink[], options: SankeyLayoutOptions): void {
  const { nodeWidth = 12, nodePadding = 14, iterations = 6 } = options
  const [width, height] = [options.width, options.height].map((size) => Math.max(0, size))
  const fullest = Math.max(...columns.map((column) => column.length))
  const padding = fullest > 1 ? Math.min(nodePadding, height / 2 / (fullest - 1)) : nodePadding
  const ky = Math.min(...columns.map((column) => (height - (column.length - 1) * padding) / total(column)))
  const step = (width - nodeWidth) / Math.max(1, columns.length - 1)
  columns.forEach((column, index) => {
    let y = 0
    for (const node of column) {
      node.x0 = index * step
      node.x1 = node.x0 + nodeWidth
      node.y0 = y
      node.y1 = y + node.value * ky
      y = node.y1 + padding
    }
    // Share the spare height out evenly, so a short column sits centred.
    const spare = (height - y + padding) / (column.length + 1)
    column.forEach((node, rank) => move(node, spare * (rank + 1)))
  })
  for (const link of links) link.width = link.value * ky
  for (let pass = 0, alpha = 0.99; pass < iterations; pass++, alpha *= 0.99) {
    relax([...columns].reverse(), 'outLinks', alpha, padding, height)
    relax(columns, 'inLinks', alpha, padding, height)
  }
  stackLinks(columns.flat())
}

/** Moves each node part way to the value-weighted centre of its neighbours on one side, column by column. */
function relax(columns: WorkNode[][], side: 'inLinks' | 'outLinks', alpha: number, padding: number, height: number) {
  for (const column of columns) {
    for (const node of column) {
      const links = node[side]
      if (links.length === 0) continue
      const weighted = links.reduce((sum, link) => sum + centre(side === 'inLinks' ? link.source : link.target) * link.value, 0)
      move(node, (weighted / total(links) - centre(node)) * alpha)
    }
    // By centre, not top edge: nodes pulled to one point keep the caller's order instead of sorting by size.
    column.sort((a, b) => centre(a) - centre(b) || a.order - b.order)
    spreadSpans(column, padding, height)
  }
}

/**
 * Resolves overlaps among spans sorted by `y0`: top-down each starts `gap` below the one before, then
 * bottom-up the stack is pulled back to end by `max`.
 */
export function spreadSpans(spans: SankeySpan[], gap: number, max: number): void {
  let edge = 0
  for (const span of spans) {
    if (span.y0 < edge) move(span, edge - span.y0)
    edge = span.y1 + gap
  }
  edge = max
  for (let index = spans.length - 1; index >= 0; index--) {
    const span = spans[index]
    if (span.y1 > edge) move(span, edge - span.y1)
    edge = span.y0 - gap
  }
}

/** Orders each node's links by the position of their far ends and stacks them centred on the node. */
function stackLinks(nodes: WorkNode[]): void {
  const lay = (node: WorkNode, links: WorkLink[], end: 'y0' | 'y1') => {
    let y = centre(node) - links.reduce((sum, link) => sum + link.width, 0) / 2
    for (const link of links) {
      link[end] = y + link.width / 2
      y += link.width
    }
  }
  for (const node of nodes) {
    node.outLinks.sort((a, b) => a.target.y0 - b.target.y0 || a.order - b.order)
    node.inLinks.sort((a, b) => a.source.y0 - b.source.y0 || a.order - b.order)
    lay(node, node.outLinks, 'y0')
    lay(node, node.inLinks, 'y1')
  }
}

/**
 * The classic horizontal cubic for a link. `ribbon` (default) is a filled band whose top and bottom
 * edges are the same curve one link width apart; `center` is the centre line, for a stroke of the
 * link's width or for flow particles. Each kind always emits the same commands, so `d` can morph.
 */
export function linkPath(link: SankeyLinkBox, kind: 'ribbon' | 'center' = 'ribbon'): string {
  const [x0, x1, xm] = [link.x0, link.x1, (link.x0 + link.x1) / 2].map(fmt)
  if (kind === 'center') {
    const [y0, y1] = [link.y0, link.y1].map(fmt)
    return `M${x0},${y0}C${xm},${y0} ${xm},${y1} ${x1},${y1}`
  }
  const half = link.width / 2
  const [t0, t1, b0, b1] = [link.y0 - half, link.y1 - half, link.y0 + half, link.y1 + half].map(fmt)
  return `M${x0},${t0}C${xm},${t0} ${xm},${t1} ${x1},${t1}L${x1},${b1}C${xm},${b1} ${xm},${b0} ${x0},${b0}Z`
}

/**
 * Ids of everything upstream and downstream of a node, or of a link's two ends: the path a hover
 * highlights. Null when the id is not in `links` (say, after a data change removed it).
 */
export function sankeyPath(
  links: readonly Pick<SankeyLink, 'id' | 'source' | 'target'>[],
  focus: { readonly kind: 'node' | 'link'; readonly id: string },
): { nodes: Set<string>; links: Set<string> } | null {
  const nodes = new Set<string>()
  const ids = new Set<string>()
  const walk = (start: string, downstream: boolean) => {
    const stack = [start]
    for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
      nodes.add(id)
      for (const link of links) {
        if ((downstream ? link.source : link.target) !== id || ids.has(link.id)) continue
        ids.add(link.id)
        stack.push(downstream ? link.target : link.source)
      }
    }
  }
  const link = focus.kind === 'link' ? links.find((candidate) => candidate.id === focus.id) : undefined
  if (link) ids.add(link.id)
  walk(link?.target ?? focus.id, true)
  walk(link?.source ?? focus.id, false)
  return ids.size > 0 ? { nodes, links: ids } : null
}
