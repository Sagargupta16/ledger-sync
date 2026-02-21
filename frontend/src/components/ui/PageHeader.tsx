import { memo, useState, useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { useReducedMotion } from '@/hooks/useReducedMotion'

interface PageHeaderProps {
  title: string
  subtitle?: string
  action?: ReactNode
}

/**
 * Consistent page header with h1 title, optional subtitle, and action slot.
 * Compresses on scroll — title shrinks, subtitle fades — to give more room for data.
 */
const PageHeader = memo(function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  const reducedMotion = useReducedMotion()
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const main = document.getElementById('main-content')
    if (!main) return
    const onScroll = () => setScrolled(main.scrollTop > 40)
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  const Wrapper = reducedMotion ? 'div' : motion.div

  return (
    <Wrapper
      {...(!reducedMotion && { initial: { opacity: 0, y: -10 }, animate: { opacity: 1, y: 0 } })}
      className="sticky top-0 z-20 -mx-8 px-8 py-4 transition-all duration-300 backdrop-blur-xl bg-background/80"
      style={{
        paddingTop: scrolled ? '0.75rem' : '1rem',
        paddingBottom: scrolled ? '0.75rem' : '1rem',
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1
            className="text-page-title text-white tracking-tight transition-all duration-300"
            style={{ fontSize: scrolled ? '1.25rem' : undefined }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="mt-1 text-sm text-muted-foreground transition-all duration-300"
              style={{
                opacity: scrolled ? 0 : 1,
                maxHeight: scrolled ? 0 : '2rem',
                marginTop: scrolled ? 0 : '0.25rem',
                overflow: 'hidden',
              }}
            >
              {subtitle}
            </p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </Wrapper>
  )
})

export default PageHeader
