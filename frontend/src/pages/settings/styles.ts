/**
 * Shared CSS class strings and animation variants for Settings sections.
 */

export const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  }),
}

export const inputClass =
  'w-full px-3 py-2 bg-white/5 border border-border rounded-lg text-white text-sm focus:border-primary focus:outline-none transition-colors'

export const selectClass =
  'w-full px-3 py-2 bg-white/5 border border-border rounded-lg text-white text-sm focus:border-primary focus:outline-none transition-colors'
