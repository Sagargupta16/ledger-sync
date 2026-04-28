import { memo, useState, useEffect, type ReactNode } from 'react'
import { motion } from 'framer-motion'

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
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const main = document.getElementById('main-content')
    if (!main) return
    const onScroll = () => setScrolled(main.scrollTop > 40)
    main.addEventListener('scroll', onScroll, { passive: true })
    return () => main.removeEventListener('scroll', onScroll)
  }, [])

  // Sticky headers get painted at the viewport edge, so in PWA standalone
  // mode the title lands under the notch unless we add safe-area padding.
  // We bake env(safe-area-inset-top) into the padding calc. The compressed
  // state on scroll keeps the same inset -- only the design padding shrinks.
  const basePadTop = scrolled ? '0.75rem' : '1rem'
  const basePadBottom = scrolled ? '0.75rem' : '1rem'

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className="sticky top-0 z-20 -mx-4 md:-mx-6 lg:-mx-8 px-4 md:px-6 lg:px-8 py-3 md:py-4 transition-all duration-150 ease-out backdrop-blur-md bg-black/80"
      style={{
        paddingTop: `calc(${basePadTop} + env(safe-area-inset-top, 0px))`,
        paddingBottom: basePadBottom,
        paddingLeft: 'max(1rem, env(safe-area-inset-left))',
        paddingRight: 'max(1rem, env(safe-area-inset-right))',
      }}
    >
      {/* Mobile: stack + center everything (title, subtitle, action). The title
          block reserves horizontal room for the lg:hidden hamburger which sits at
          `calc(safe-area-inset-left + 1rem)` top-left. 3rem of padding on each
          side keeps the centered title balanced and clear of the button.
          Desktop (sm+): reverts to the original row layout with title left, action right. */}
      <div className="flex flex-col items-center text-center sm:flex-row sm:items-start sm:justify-between sm:text-left gap-3 sm:gap-4">
        <div className="min-w-0 px-12 sm:px-0">
          <h1
            className="text-page-title text-white tracking-tight transition-all duration-150 ease-out"
            style={{ fontSize: scrolled ? '1.25rem' : undefined }}
          >
            {title}
          </h1>
          {subtitle && (
            <p
              className="mt-1 text-sm text-muted-foreground transition-all duration-150 ease-out"
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
    </motion.div>
  )
})

export default PageHeader
