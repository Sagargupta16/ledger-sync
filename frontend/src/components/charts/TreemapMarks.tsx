/**
 * The marks Treemap draws. Every tile keeps its geometry in motion values and tweens it with one shared
 * transition, so a zoom moves the map as a single view: the opened tile grows to fill the plot, its
 * children open inside it, and its siblings slide out past the clipped edges. The entrance grows tiles
 * from their centres in sequence; a data change morphs them by id. Labels ride their tiles unscaled.
 */

import { useEffect, useMemo, useRef, type PointerEvent, type RefObject } from 'react'
import { AnimatePresence, animate, motion, useMotionValue, usePresence, useTransform } from 'motion/react'

import { useChartFrame } from './chartContext'
import { CHART_EASE, CHART_MOTION, chartTransition } from './chartMotion'
import { roundedRectPath } from './paths'
import type { TreemapRect } from './treemapLayout'
import { canOpen, collapse, fitLabel, tilePaint, tileText, treemapView, type TileLabel, type TileView, type TreemapNode } from './treemapModel'

const DIM = 0.55
const ZOOM = CHART_MOTION.update
/** Fading in runs over the first 60% of a zoom and fading out over the last, so a tile and its cover never both thin out. */
const FADE_IN = { duration: ZOOM * 0.6, ease: CHART_EASE }
const FADE_OUT = { duration: ZOOM * 0.6, ease: CHART_EASE, delay: ZOOM * 0.4 }
const LABEL_IN = { duration: 0.25, ease: CHART_EASE }
const LABEL_OUT = { duration: 0.12, ease: CHART_EASE }

export interface TreemapMarksProps {
  readonly nodes: readonly TreemapNode[]
  /** The opened category, or null at the top level. */
  readonly openId: string | null
  /** The emphasised tile in the level being browsed: hovered, tapped or arrowed to. */
  readonly activeId: string | null
  readonly formatValue: (value: number) => string
  readonly onHover: (id: string | null) => void
  readonly onPress: (id: string, pointerType: string, button: number) => void
}

/** Lays the view out at the frame's size and draws its tiles inside a clip, so leaving siblings vanish at the edges. */
export default function TreemapMarks({ nodes, openId, activeId, formatValue, onHover, onPress }: TreemapMarksProps) {
  const { width, height, isMobile, entered, animate: moving, chartId } = useChartFrame()
  const gap = isMobile ? 2 : 3
  // Laid out half a gap past every edge, so after the inset the outer tiles sit flush with the plot.
  const tiles = useMemo(
    () => treemapView(nodes, openId, { x: -gap / 2, y: -gap / 2, width: width + gap, height: height + gap }),
    [nodes, openId, width, height, gap],
  )
  const revealed = useRef(false)
  const hasTiles = tiles.length > 0
  // Effects run children first, so tiles mounted with the reveal still read false and play the entrance.
  useEffect(() => {
    if (!entered || !hasTiles) return
    revealed.current = true
    return () => { revealed.current = false }
  }, [entered, hasTiles])
  const emphasis = tiles.some((tile) => tile.live && tile.node.id === activeId)

  return (
    <g onPointerLeave={(event) => { if (event.pointerType === 'mouse') onHover(null) }}>
      {/* Holds the hover across the gaps between tiles. */}
      <rect width={width} height={height} fill="transparent" />
      {/* One px past the plot holds the outer half of an active tile's 2px edge; pushed-out siblings start beyond it. */}
      <clipPath id={`${chartId}-plot`}>
        <rect x={-1} y={-1} width={width + 2} height={height + 2} />
      </clipPath>
      <g clipPath={`url(#${chartId}-plot)`}>
        <AnimatePresence>
          {tiles.map((tile) => {
            const active = emphasis && tile.live && tile.node.id === activeId
            return (
              <Tile key={tile.key} tile={tile} active={active} dim={emphasis && tile.live && !active}
                label={fitLabel(tile.node.label, formatValue(tile.node.value), tile.rect.width - gap, tile.rect.height - gap, isMobile)}
                openable={tile.live && canOpen(tile.node)} gap={gap} mobile={isMobile} still={!moving} entered={entered}
                revealed={revealed} onHover={onHover} onPress={onPress} />
            )
          })}
        </AnimatePresence>
      </g>
    </g>
  )
}

type TileProps = Readonly<{
  tile: TileView; label: TileLabel | null; active: boolean; dim: boolean; openable: boolean
  gap: number; mobile: boolean; still: boolean; entered: boolean; revealed: RefObject<boolean>
  onHover: (id: string | null) => void; onPress: (id: string, pointerType: string, button: number) => void
}>

/** One tile and its label. Geometry and fades are motion values, so moving never re-renders React. */
function Tile({ tile, label, active, dim, openable, gap, mobile, still, entered, revealed, onHover, onPress }: TileProps) {
  const [present, safeToRemove] = usePresence()
  const { rect, origin, shown } = tile
  const visible = shown ? 1 : 0
  const from = entryRect(tile, still, entered)
  const x = useMotionValue(from.x)
  const y = useMotionValue(from.y)
  const w = useMotionValue(from.width)
  const h = useMotionValue(from.height)
  const opacity = useMotionValue(still || !entered ? visible : 0)
  const labelOpacity = useMotionValue(0)
  const radius = mobile ? 4 : 6
  const { pad } = tileText(mobile)
  const d = useTransform(() => tilePath({ x: x.get(), y: y.get(), width: w.get(), height: h.get() }, gap, radius))
  const labelX = useTransform(() => x.get() + gap / 2 + pad)
  const labelY = useTransform(() => y.get() + gap / 2 + pad)
  const live = tile.live && present
  const showLabel = live && entered && label !== null

  // To the view's rect: the staggered entrance first, then one shared tween for every zoom and data change.
  useEffect(() => {
    if (still || !entered || !present) return
    const intro = !revealed.current
    const move = intro ? chartTransition('bar', true, tile.delay) : chartTransition('update', true)
    const runs = [
      animate(x, rect.x, move), animate(y, rect.y, move), animate(w, rect.width, move), animate(h, rect.height, move),
      animate(opacity, visible, intro ? move : fadeTo(visible, opacity.get())),
    ]
    return () => { for (const run of runs) run.stop() }
  }, [still, entered, present, rect.x, rect.y, rect.width, rect.height, visible, tile.delay, revealed, x, y, w, h, opacity])

  // Leaving (a zoom out, or a category gone from the data): back to its origin, faded, then unmounted.
  useEffect(() => {
    if (present) return
    if (still) {
      safeToRemove?.()
      return
    }
    let cancelled = false
    const move = chartTransition('update', true)
    const runs = [
      animate(x, origin.x, move), animate(y, origin.y, move), animate(w, origin.width, move), animate(h, origin.height, move),
      animate(opacity, 0, FADE_OUT),
    ]
    void Promise.all(runs.map((run) => run.finished)).then(() => {
      if (!cancelled) safeToRemove?.()
    })
    return () => {
      cancelled = true
      for (const run of runs) run.stop()
    }
  }, [present, still, safeToRemove, origin.x, origin.y, origin.width, origin.height, x, y, w, h, opacity])

  // A label fades in once its tile is near full size and out at once, so text never overhangs a shrinking tile.
  useEffect(() => {
    if (still) return
    const delay = revealed.current ? ZOOM * 0.6 : tile.delay + CHART_MOTION.bar * 0.5
    const run = animate(labelOpacity, showLabel ? 1 : 0, showLabel ? { ...LABEL_IN, delay } : LABEL_OUT)
    return () => run.stop()
  }, [still, showLabel, tile.delay, revealed, labelOpacity])

  const paint = tilePaint(tile.color, tile.strength, active)
  const strokeWidth = active ? 2 : 1
  const rest = dim ? DIM : 1
  const pointerEvents = live ? undefined : 'none'
  const cursor = openable ? 'cursor-pointer' : undefined
  const onPointerEnter = (event: PointerEvent<SVGPathElement>) => {
    if (event.pointerType === 'mouse') onHover(tile.node.id)
  }
  const onPointerUp = (event: PointerEvent<SVGPathElement>) => onPress(tile.node.id, event.pointerType, event.button)

  // Print and Reduced draw the final view at once: nothing waits on an animation frame.
  if (still) {
    return (
      <g opacity={shown ? rest : 0} pointerEvents={pointerEvents}>
        <path d={tilePath(rect, gap, radius)} style={paint} strokeWidth={strokeWidth} className={cursor} data-tile={tile.key}
          onPointerEnter={onPointerEnter} onPointerUp={onPointerUp} />
        {label && showLabel && (
          <g transform={`translate(${rect.x + gap / 2 + pad} ${rect.y + gap / 2 + pad})`} pointerEvents="none">
            <TileText label={label} mobile={mobile} />
          </g>
        )}
      </g>
    )
  }
  return (
    <motion.g style={{ opacity }} pointerEvents={pointerEvents}>
      <motion.g initial={false} animate={{ opacity: rest }} transition={chartTransition('hover', true)}>
        <motion.path d={d} style={paint} strokeWidth={strokeWidth} className={`transition-[fill,stroke] duration-150 ${cursor ?? ''}`}
          data-tile={tile.key} onPointerEnter={onPointerEnter} onPointerUp={onPointerUp} />
        {label && (
          <motion.g style={{ x: labelX, y: labelY, opacity: labelOpacity }} pointerEvents="none">
            <TileText label={label} mobile={mobile} />
          </motion.g>
        )}
      </motion.g>
    </motion.g>
  )
}

/** The name on one row and, when it fits, the amount under it. */
function TileText({ label, mobile }: Readonly<{ label: TileLabel; mobile: boolean }>) {
  const { font, line } = tileText(mobile)
  const row = (index: number) => index * line + line / 2 + font * 0.35
  return (
    <text fontSize={font} className="fill-foreground">
      <tspan x={0} y={row(0)} className="font-medium">{label.name}</tspan>
      {label.value !== undefined && <tspan x={0} y={row(1)} className="font-mono">{label.value}</tspan>}
    </text>
  )
}

/** Where a tile mounts: final with motion off, collapsed while the entrance waits, else its origin. */
function entryRect(tile: TileView, still: boolean, entered: boolean): TreemapRect {
  if (still) return tile.rect
  return entered ? tile.origin : collapse(tile.rect)
}

const fadeTo = (target: number, current: number) => (target >= current ? FADE_IN : FADE_OUT)

/** The tile's rounded rect, inset half a gap on every side. */
function tilePath({ x, y, width, height }: TreemapRect, gap: number, radius: number): string {
  return roundedRectPath(x + gap / 2, y + gap / 2, width - gap, height - gap, [radius, radius, radius, radius])
}
