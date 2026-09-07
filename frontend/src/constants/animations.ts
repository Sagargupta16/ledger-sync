import type { Variants } from 'motion/react'

export const EASING = {
  cinematic: [0.16, 1, 0.3, 1] as const,
  brisk: [0.25, 0.1, 0.25, 1] as const,
  smooth: [0.25, 0.46, 0.45, 0.94] as const,
}

export const DURATION = {
  quick: 0.25,
  default: 0.4,
  slow: 0.6,
}

export const SPRING = {
  activePill: { type: 'spring' as const, stiffness: 500, damping: 40 },
  card: { type: 'spring' as const, stiffness: 380, damping: 26 },
  control: { type: 'spring' as const, stiffness: 500, damping: 28 },
}

export const VIEWPORT_MARGIN = '0px 0px -60px 0px'

const ITEM_OFFSET = 16
const SECTION_OFFSET = 24

export const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.08,
    },
  },
}

export const staggerFast: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.03,
      delayChildren: 0.04,
    },
  },
}

export const fadeUpItem: Variants = {
  hidden: { opacity: 0, y: ITEM_OFFSET },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: EASING.cinematic },
  },
}

export const slideInLeftItem: Variants = {
  hidden: { opacity: 0, x: -ITEM_OFFSET },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.35, ease: EASING.cinematic },
  },
}

export const FADE_UP = {
  initial: { opacity: 0, y: ITEM_OFFSET },
  animate: { opacity: 1, y: 0 },
  transition: { duration: DURATION.default, ease: EASING.cinematic },
} as const

export function fadeUpWithDelay(delay: number) {
  return {
    initial: { opacity: 0, y: ITEM_OFFSET },
    animate: { opacity: 1, y: 0 },
    transition: {
      delay: Math.min(delay, 0.3),
      duration: DURATION.default,
      ease: EASING.cinematic,
    },
  } as const
}

export const SCROLL_FADE_UP = {
  initial: { opacity: 0, y: SECTION_OFFSET },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: VIEWPORT_MARGIN },
  transition: { duration: 0.5, ease: EASING.cinematic },
} as const

export const sectionReveal: Variants = {
  hidden: { opacity: 0, y: SECTION_OFFSET },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: EASING.cinematic },
  },
}

export const waveCascadeContainer: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.08 },
  },
}

export const waveCascadeItem: Variants = {
  hidden: { opacity: 0, y: ITEM_OFFSET, scale: 0.96 },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: DURATION.default, ease: EASING.brisk },
  },
}

export const CARD_HOVER = {
  y: -3,
  transition: SPRING.card,
} as const

export const TAP_FEEDBACK = { scale: 0.97 } as const

export const DISCLOSURE_TRANSITION = {
  layout: 'position',
  initial: { opacity: 0, y: -8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: {
    duration: DURATION.quick,
    ease: EASING.cinematic,
    layout: { duration: DURATION.quick, ease: EASING.cinematic },
  },
} as const

export const ROUTE_TRANSITION = {
  initial: { opacity: 0, y: 20 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.19, ease: EASING.cinematic },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.1, ease: 'easeIn' },
  },
} as const
