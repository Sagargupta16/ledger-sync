import type { FlowBranch } from '../sampleData'

export const NODE_WIDTH = 10

export interface FlowLink extends FlowBranch {
  /** Ribbon thickness in px, proportional to `value`. */
  thickness: number
  /** Centre-line cubic from the source node to the target node. */
  path: string
  /** Top edge of the target node. */
  nodeY: number
  /** Vertical centre of the target node, where its label sits. */
  centerY: number
  share: number
}

export interface FlowLayout {
  width: number
  height: number
  source: { y: number; height: number }
  targetX: number
  labelX: number
  links: FlowLink[]
}

interface FlowLayoutOptions {
  width: number
  height: number
  /** Space reserved right of the target nodes for name + amount labels. */
  labelWidth: number
  gap?: number
  padY?: number
}

const round = (value: number) => Math.round(value * 10) / 10

/**
 * One-stage horizontal Sankey: a single source node on the left fans out to
 * one target node per branch on the right. Ribbons leave the source stacked
 * edge to edge and arrive at targets separated by `gap`, all in real pixels so
 * the SVG can use a 1:1 viewBox and text never scales.
 */
export function layoutFlow(
  branches: readonly FlowBranch[],
  { width, height, labelWidth, gap = 14, padY = 6 }: FlowLayoutOptions,
): FlowLayout {
  const total = branches.reduce((sum, branch) => sum + branch.value, 0)
  const usable = height - padY * 2 - gap * Math.max(branches.length - 1, 0)
  const scale = total > 0 ? usable / total : 0
  const sourceHeight = total * scale
  const sourceY = (height - sourceHeight) / 2
  const targetX = width - labelWidth - NODE_WIDTH
  const midX = (NODE_WIDTH + targetX) / 2

  let sourceCursor = sourceY
  let targetCursor = padY
  const links = branches.map((branch) => {
    const thickness = branch.value * scale
    const startY = sourceCursor + thickness / 2
    const nodeY = targetCursor
    const centerY = nodeY + thickness / 2
    sourceCursor += thickness
    targetCursor += thickness + gap
    return {
      ...branch,
      thickness,
      nodeY,
      centerY,
      share: total > 0 ? branch.value / total : 0,
      path: `M${NODE_WIDTH} ${round(startY)} C${round(midX)} ${round(startY)} ${round(midX)} ${round(centerY)} ${round(targetX)} ${round(centerY)}`,
    }
  })

  return {
    width,
    height,
    source: { y: sourceY, height: sourceHeight },
    targetX,
    labelX: targetX + NODE_WIDTH + 10,
    links,
  }
}
