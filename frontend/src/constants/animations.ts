import type { Variants } from 'framer-motion'

// ---------------------------------------------------------------------------
// Variant-based animations (use with variants={...} initial="hidden" animate="visible")
// ---------------------------------------------------------------------------

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.025,
      delayChildren: 0,
    },
  },
}

export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.015,
      delayChildren: 0,
    },
  },
}

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.18, ease: 'easeOut' },
  },
}

export const slideInLeftItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.18, ease: 'easeOut' },
  },
}

// ---------------------------------------------------------------------------
// Inline-prop presets (use with {...FADE_UP} spread on motion elements)
// ---------------------------------------------------------------------------

export const FADE_UP = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: 'easeOut' },
} as const

export function fadeUpWithDelay(delay: number) {
  return {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { delay: Math.min(delay, 0.1), duration: 0.18, ease: 'easeOut' },
  } as const
}

// ---------------------------------------------------------------------------
// Scroll-triggered presets (use with whileInView)
// ---------------------------------------------------------------------------

export const SCROLL_FADE_UP = {
  initial: { opacity: 0, y: 8 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-20px' },
  transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
} as const

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

export const cardHover = {
  y: -4,
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
}

/** MetricCard / stat-tile hover: subtle lift with a quick spring. */
export const HOVER_LIFT = {
  whileHover: { y: -3 },
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
} as const

// ---------------------------------------------------------------------------
// Page-level presets (adapted from brand/portfolio-react's motion vocabulary)
// ---------------------------------------------------------------------------

/** Whole-page content entrance: one quiet fade-up on navigation. Applied by
 * PageContainer so every page gets it without per-page wiring. */
export const PAGE_ENTER = {
  initial: { opacity: 0, y: 4 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] as const },
} as const

/** PageHeader title block: slides in slightly ahead of the body. */
export const HEADER_ENTER = {
  initial: { opacity: 1, y: 0 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0 },
} as const

/** Section reveal with a hint of scale (portfolio-react sectionRevealEnhanced). */
export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: 8, scale: 0.995 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, ease: [0.25, 0.46, 0.45, 0.94] },
  },
}

/** Wave cascade for dense grids of small items (portfolio-react skill tags). */
export const waveCascadeContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.015, delayChildren: 0 },
  },
}

export const waveCascadeItem: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.995 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.16, ease: 'easeOut' },
  },
}
