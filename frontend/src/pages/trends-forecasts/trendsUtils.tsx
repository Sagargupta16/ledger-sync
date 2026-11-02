import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import type { TrendDirection } from './types'

export function getDirectionIcon(direction: TrendDirection): React.ReactElement {
  if (direction === 'up') {
    return <ArrowUpRight className="w-4 h-4" />
  }
  if (direction === 'down') {
    return <ArrowDownRight className="w-4 h-4" />
  }
  return <Minus className="w-4 h-4" />
}

export function getTrendDirection(change: number): TrendDirection {
  if (Math.abs(change) < 2) return 'stable'
  return change > 0 ? 'up' : 'down'
}
