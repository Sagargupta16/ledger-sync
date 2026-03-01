/**
 * Drop-in replacement for Recharts' ResponsiveContainer.
 *
 * Adds minWidth={0} and minHeight={0} to prevent negative dimension
 * calculations. The corresponding console warning is suppressed globally
 * in main.tsx (before any component renders).
 *
 * Usage: import { ChartContainer } from '@/components/ui' and use it
 * exactly like <ResponsiveContainer>.
 */

import type { ReactNode } from 'react'
import { ResponsiveContainer } from 'recharts'

type ResponsiveDimension = number | `${number}%`

interface ChartContainerProps {
  width?: ResponsiveDimension
  height?: ResponsiveDimension
  minWidth?: number
  minHeight?: number
  aspect?: number
  children: ReactNode
}

export default function ChartContainer({
  width = '100%',
  height = '100%',
  children,
  ...rest
}: Readonly<ChartContainerProps>) {
  return (
    <ResponsiveContainer
      width={width}
      height={height}
      minWidth={0}
      minHeight={0}
      {...rest}
    >
      {children}
    </ResponsiveContainer>
  )
}
