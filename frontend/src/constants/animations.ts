import type { Variants } from 'framer-motion'

// ---------------------------------------------------------------------------
// Variant-based animations (use with variants={...} initial="hidden" animate="visible")
// ---------------------------------------------------------------------------

/** Stagger container — wrap parent element, children use fadeUpItem */
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

/** Fast stagger — tighter timing for sidebar / nav items */
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

/** Standard child item — fade up from 20px */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
  },
}

/** Slide-in from left variant — for sidebar items & list rows */
export const slideInLeftItem: Variants = {
  hidden: { opacity: 0, x: -12 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.3, ease: 'easeOut' },
  },
}

/** Scale-in from center — for badges, icons, floating elements */
export const scaleInItem: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
}

/** Slide-up with spring — bouncier entrance for cards */
export const springUpItem: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: 'spring', stiffness: 300, damping: 24 },
  },
}

// ---------------------------------------------------------------------------
// Inline-prop presets (use with {...FADE_UP} spread on motion elements)
// Module-scope constants are referentially stable → no new objects per render.
// ---------------------------------------------------------------------------

/** Fade-up: opacity 0→1, y 20→0. The most common animation pattern. */
export const FADE_UP = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
} as const

/** Slide-in from left: opacity 0→1, x -20→0. Used in tables/lists. */
export const SLIDE_IN_LEFT = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
} as const

/** Scale-in from center: opacity 0→1, scale 0.85→1 */
export const SCALE_IN = {
  initial: { opacity: 0, scale: 0.85 },
  animate: { opacity: 1, scale: 1 },
} as const

/** No-op animation props — identical shape, zero motion. */
export const NO_MOTION = {
  initial: { opacity: 1 },
  animate: { opacity: 1 },
} as const

/** Fade-up with a specific delay. Use for staggered page sections. */
export function fadeUpWithDelay(delay: number) {
  return {
    initial: { opacity: 0, y: 20 },
    animate: { opacity: 1, y: 0 },
    transition: { delay },
  } as const
}

/** Scale-in with a specific delay */
export function scaleInWithDelay(delay: number) {
  return {
    initial: { opacity: 0, scale: 0.85 },
    animate: { opacity: 1, scale: 1 },
    transition: { delay, type: 'spring', stiffness: 300, damping: 25 },
  } as const
}

// ---------------------------------------------------------------------------
// Scroll-triggered presets (use with whileInView)
// ---------------------------------------------------------------------------

/** Scroll-triggered fade up — use with whileInView */
export const SCROLL_FADE_UP = {
  initial: { opacity: 0, y: 40 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] },
} as const

/** Scroll-triggered scale in */
export const SCROLL_SCALE_IN = {
  initial: { opacity: 0, scale: 0.9 },
  whileInView: { opacity: 1, scale: 1 },
  viewport: { once: true, margin: '-50px' },
  transition: { duration: 0.5, type: 'spring', stiffness: 200, damping: 20 },
} as const

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

/** Interactive button press */
export const tapScale = { scale: 0.97 }

/** Card hover lift — subtle Y lift + shadow amplification */
export const cardHover = {
  y: -4,
  transition: { type: 'spring' as const, stiffness: 400, damping: 25 },
}

/** Gentle hover scale for icons/badges */
export const iconHover = {
  scale: 1.1,
  transition: { type: 'spring' as const, stiffness: 400, damping: 20 },
}
