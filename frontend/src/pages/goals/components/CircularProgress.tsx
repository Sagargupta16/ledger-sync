import { cssVar } from '@/constants/colors'

export default function CircularProgress({
  progress,
  color,
  size = 80,
}: Readonly<{ progress: number; color: string; size?: number }>) {
  const strokeWidth = 6
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(progress, 100) / 100) * circumference

  // Strokes go through `style` (a CSS declaration), so var() tokens resolve at
  // paint time and the ring follows a theme toggle without a re-render.
  return (
    <svg width={size} height={size} className="transform -rotate-90" aria-hidden="true">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        style={{ stroke: cssVar('--chart-svg-stroke') }}
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        style={{ stroke: color }}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="transition-colors duration-700 ease-out"
      />
    </svg>
  )
}
