import type { LinearScale } from '@/components/charts/scales'

import { tickFont } from './canvasColors'
import { tickLabels } from './tickLabels'

type Format = (value: number) => string

/** Horizontal grid lines with their value labels on the left, as the kit's ValueAxis draws them. */
export function YTicks({
  scale, x0, x1, format, fallback, isMobile,
}: Readonly<{ scale: LinearScale; x0: number; x1: number; format: Format; fallback?: Format; isMobile: boolean }>) {
  return (
    <g aria-hidden="true">
      {tickLabels(scale.ticks(isMobile ? 4 : 5), format, fallback).map(([tick, label]) => (
        <g key={tick}>
          <line x1={x0} x2={x1} y1={scale(tick)} y2={scale(tick)} strokeDasharray="2 5" className="stroke-(--chart-grid)" />
          <text
            x={x0 - 8}
            y={scale(tick)}
            dy="0.355em"
            textAnchor="end"
            fontSize={tickFont(isMobile)}
            className="fill-(--chart-text-subtle) font-mono"
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  )
}

/** Vertical grid lines with their value labels underneath, for a numeric x axis. */
export function XTicks({
  scale, y0, y1, format, fallback, isMobile,
}: Readonly<{ scale: LinearScale; y0: number; y1: number; format: Format; fallback?: Format; isMobile: boolean }>) {
  return (
    <g aria-hidden="true">
      {tickLabels(scale.ticks(isMobile ? 3 : 5), format, fallback).map(([tick, label]) => (
        <g key={tick}>
          <line x1={scale(tick)} x2={scale(tick)} y1={y0} y2={y1} strokeDasharray="2 5" className="stroke-(--chart-grid)" />
          <text
            x={scale(tick)}
            y={y1 + 14}
            textAnchor="middle"
            fontSize={tickFont(isMobile)}
            className="fill-(--chart-text-subtle) font-mono"
          >
            {label}
          </text>
        </g>
      ))}
    </g>
  )
}

/** Category labels along the bottom, thinned so neighbours never overlap. */
export function XLabels({
  labels, centers, y, width, isMobile,
}: Readonly<{ labels: readonly string[]; centers: readonly number[]; y: number; width: number; isMobile: boolean }>) {
  const font = tickFont(isMobile)
  const longest = Math.max(1, ...labels.map((label) => Math.min(label.length, 14)))
  const room = (longest * font * 0.62 + 8) * labels.length
  const every = Math.max(1, Math.ceil(room / Math.max(1, width)))
  return (
    <g aria-hidden="true">
      {labels.map((label, index) =>
        index % every === 0 || index === labels.length - 1 ? (
          <text key={label} x={centers[index]} y={y} textAnchor="middle" fontSize={font} className="fill-(--chart-text-subtle) font-mono">
            {label.length > 14 ? `${label.slice(0, 13)}…` : label}
          </text>
        ) : null,
      )}
    </g>
  )
}
