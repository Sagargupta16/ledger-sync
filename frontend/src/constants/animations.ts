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

/** Standard child item — fade up from 20px */
export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: 'easeOut' },
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

// ---------------------------------------------------------------------------
// Interactive
// ---------------------------------------------------------------------------

/** Interactive button press */
export const tapScale = { scale: 0.97 }
