import type { Variants } from 'motion/react'

export const EASING = {
  cinematic: [0.16, 1, 0.3, 1] as const,
  smooth: [0.25, 0.46, 0.45, 0.94] as const,
}

export const DURATION = {
  quick: 0.25,
  default: 0.4,
  slow: 0.6,
}

export const SPRING = {
  activePill: { type: 'spring' as const, stiffness: 500, damping: 40 },
  control: { type: 'spring' as const, stiffness: 500, damping: 28 },
}

const VIEWPORT_MARGIN = '0px 0px -60px 0px'

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

// Scroll-in reveal of a chart section (`panel`); the plot inside it animates
// through the chart kit's own in-view entrance. With motion off, it renders in place.
const REVEAL_EASE = [0.22, 1, 0.36, 1] as const
const IN_VIEW_REVEAL = {
  panel: { y: 16, amount: 0.1, duration: 0.45 },
} as const

export function inViewReveal(kind: keyof typeof IN_VIEW_REVEAL, motionEnabled: boolean) {
  const { y, amount, duration } = IN_VIEW_REVEAL[kind]
  return {
    initial: motionEnabled ? { opacity: 0, y } : false,
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, amount },
    transition: { duration: motionEnabled ? duration : 0, ease: REVEAL_EASE },
  } as const
}

export const TAP_FEEDBACK = { scale: 0.97 } as const

// For a panel that mounts open. Every use except CollapsibleSection passes `layoutDependency` with what can
// move the open panel or resize its `layout` parent, or else its open flag (`true`
// in a form that only renders open), so Motion measures layout on those changes
// instead of every render. A resizing parent projects the panel from its last
// measured box, which a #main-content scroll leaves stale, so CollapsibleSection,
// whose content can resize it on any render, leaves the dependency off.
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
  initial: { opacity: 0.85, y: 8 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.19, ease: EASING.cinematic },
  },
  exit: {
    opacity: 0,
    y: -4,
    transition: { duration: 0.1, ease: 'easeIn' },
  },
} as const
