/**
 * Shared CSS class strings and animation variants for Settings sections.
 */

export const sectionVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: Math.min(i * 0.015, 0.1),
      duration: 0.18,
      ease: [0.25, 0.46, 0.45, 0.94] as const,
    },
  }),
}

export const inputClass =
  'ledger-control min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none lg:pointer-fine:min-h-10'

export const selectClass =
  'ledger-control min-h-11 w-full rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-colors focus:border-primary focus:outline-none lg:pointer-fine:min-h-10'
