import { memo, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

/**
 * Consistent page header with h1 title, optional subtitle, and action slot.
 * Provides uniform heading hierarchy across all pages.
 */
const PageHeader = memo(function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  const reducedMotion = useReducedMotion()
  const Wrapper = reducedMotion ? 'div' : motion.div

  return (
    <Wrapper
      {...(!reducedMotion && { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 } })}
      className="flex items-start justify-between gap-4"
    >
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </Wrapper>
  )
})

export default PageHeader
