import type { Variants } from 'framer-motion'

// ---------------------------------------------------------------------------
// Variant-based animations (use with variants={...} initial="hidden" animate="visible")
// ---------------------------------------------------------------------------

export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.05,
    },
  },
}

export const staggerFast: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.04,
      delayChildren: 0.02,
    },
  },
}

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
}

export const slideInLeftItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
}

// ---------------------------------------------------------------------------
// Inline-prop presets (use with {...FADE_UP} spread on motion elements)
// ---------------------------------------------------------------------------

export const FADE_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
} as const

export function fadeUpWithDelay(delay: number) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay },
  } as const
}

// ---------------------------------------------------------------------------
// Scroll-triggered presets (use with whileInView)
// ---------------------------------------------------------------------------

export const SCROLL_FADE_UP = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
} as const

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

export const cardHover = {
  y: -4,
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
}
