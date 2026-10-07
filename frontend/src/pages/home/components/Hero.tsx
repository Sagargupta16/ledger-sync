import { motion, type Variants } from 'motion/react'
import { ArrowRight, Check, Eye, Target } from 'lucide-react'

import { EASING } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

import { MoneyFlow } from './MoneyFlow'

const HIGHLIGHTS = [
  'Works with Money Manager Pro exports',
  'Smart duplicate detection',
  'Secure, private data storage',
  'India-focused tax calculations',
  'Light and dark themes',
  'Multi-account support',
]

const heroCopy: Variants = {
  hidden: {},
  shown: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}

const heroLine: Variants = {
  hidden: { opacity: 0, y: 14 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: EASING.cinematic } },
}

const heroVisual: Variants = {
  hidden: { opacity: 0, y: 20 },
  shown: { opacity: 1, y: 0, transition: { delay: 0.18, duration: 0.6, ease: EASING.cinematic } },
}

interface HeroProps {
  isAuthenticated: boolean
  onGetStarted: () => void
  onTryDemo: () => void
}

export function Hero({ isAuthenticated, onGetStarted, onTryDemo }: Readonly<HeroProps>) {
  const reduce = useMotionStore((state) => state.mode === 'reduced')
  const initial = reduce ? false : 'hidden'

  return (
    <section className="overflow-hidden border-b border-border">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-9 sm:px-6 sm:pb-14 sm:pt-16 lg:px-8 lg:pt-18">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.08fr)] lg:items-center lg:gap-14">
          <motion.div variants={heroCopy} initial={initial} animate="shown">
            <motion.p variants={heroLine} className="ledger-meta mb-4 text-muted-foreground">
              Private personal finance workspace
            </motion.p>
            <motion.h1
              variants={heroLine}
              className="max-w-2xl text-4xl font-semibold leading-[1.04] tracking-[-0.03em] text-balance text-foreground sm:text-5xl lg:text-6xl"
            >
              See where every rupee goes.
            </motion.h1>
            <motion.p
              variants={heroLine}
              className="mt-5 max-w-xl text-base leading-7 text-pretty text-muted-foreground sm:text-lg sm:leading-8"
            >
              Import Excel or CSV bank statements into one private, duplicate-safe ledger. Track
              cash flow, spending, investments and Indian income tax by April to March fiscal
              year, and ask the AI assistant about your own numbers.
            </motion.p>

            <motion.div
              variants={heroLine}
              className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center"
            >
              <button
                type="button"
                onClick={isAuthenticated ? onGetStarted : onTryDemo}
                className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground transition-[background-color,transform] active:scale-[0.97] hover:bg-app-blue-vibrant hover:text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                {isAuthenticated ? (
                  <Target className="size-4" aria-hidden="true" />
                ) : (
                  <Eye className="size-4" aria-hidden="true" />
                )}
                {isAuthenticated ? 'Open dashboard' : 'Try the demo'}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
              {!isAuthenticated && (
                <button
                  type="button"
                  onClick={onGetStarted}
                  className="ledger-control inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-5 text-sm font-medium text-foreground transition-[background-color,border-color,transform] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
                >
                  <Target className="size-4" aria-hidden="true" />
                  Get started free
                </button>
              )}
              <a
                href="#features"
                className="inline-flex min-h-11 items-center justify-center whitespace-nowrap rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
              >
                See capabilities
              </a>
            </motion.div>
            <motion.p variants={heroLine} className="mt-4 text-xs text-text-tertiary">
              No bank login needed. The demo runs on a sample ledger in your browser.
            </motion.p>
          </motion.div>

          <motion.div variants={heroVisual} initial={initial} animate="shown" className="min-w-0">
            <MoneyFlow />
          </motion.div>
        </div>

        <div className="mt-10 grid border-x border-b border-t border-border sm:mt-12 sm:grid-cols-2 lg:grid-cols-3">
          {HIGHLIGHTS.map((item) => (
            <div
              key={item}
              className="flex min-h-12 items-center gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:[&:nth-child(-n+2)]:border-t-0 lg:[&:nth-child(-n+3)]:border-t-0"
            >
              <Check className="size-4 shrink-0 text-income" aria-hidden="true" />
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
