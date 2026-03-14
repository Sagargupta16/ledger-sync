import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

/** Return the appropriate arrow icon for a change value */
export function ChangeIcon({ change, size = 'w-3.5 h-3.5' }: Readonly<{ change: number; size?: string }>) {
  if (Math.abs(change) < 1) return <Minus className={`${size} text-muted-foreground`} />
  if (change > 0) return <ArrowUpRight className={size} />
  return <ArrowDownRight className={size} />
}
