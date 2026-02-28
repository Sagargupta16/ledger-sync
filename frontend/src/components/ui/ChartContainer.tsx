/**
 * Drop-in replacement for Recharts' ResponsiveContainer that suppresses
 * the "width(-1) and height(-1)" console warning.
 *
 * Recharts warns when ResponsiveContainer measures its parent and gets
 * negative dimensions (during initial layout, hidden tabs, etc.). The
 * chart still renders correctly once layout resolves — the warning is
 * harmless. We suppress it here so it doesn't pollute the console.
 *
 * Usage: import { ChartContainer } from '@/components/ui' and use it
 * exactly like <ResponsiveContainer>.
 */

import { useEffect, type ReactNode } from 'react'
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

// Suppress the specific Recharts dimension warning once, globally.
let patched = false
function patchRechartsWarning() {
  if (patched) return
  patched = true
  const origWarn = console.warn
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === 'string' &&
      args[0].includes('should be greater than 0')
    ) {
      return
    }
    origWarn.apply(console, args)
  }
}

export default function ChartContainer({
  width = '100%',
  height = '100%',
  children,
  ...rest
}: ChartContainerProps) {
  useEffect(patchRechartsWarning, [])

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
