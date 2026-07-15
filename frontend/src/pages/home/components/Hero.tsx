import { motion } from 'framer-motion'
import { ArrowRight, Check, Eye, Target } from 'lucide-react'

const HIGHLIGHTS = [
  'Works with Money Manager Pro exports',
  'Smart duplicate detection',
  'Secure, private data storage',
  'India-focused tax calculations',
  'Light and dark themes',
  'Multi-account support',
]

interface HeroProps {
  isAuthenticated: boolean
  onGetStarted: () => void
  onTryDemo: () => void
}

export function Hero({ isAuthenticated, onGetStarted, onTryDemo }: Readonly<HeroProps>) {
  return (
    <section className="overflow-hidden border-b border-border">
      <div className="mx-auto max-w-7xl px-4 pb-10 pt-12 sm:px-6 sm:pb-14 sm:pt-16 lg:px-8 lg:pt-18">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <p className="mb-4 text-xs font-semibold uppercase text-muted-foreground">
              Private personal finance workspace
            </p>
            <h1 className="max-w-4xl text-4xl font-semibold leading-[1.03] text-foreground sm:text-5xl lg:text-6xl">
              Ledger Sync
            </h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted-foreground sm:text-xl">
              Import Excel statements, understand cash flow, track investments, and plan Indian
              taxes from one focused workspace.
            </p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex flex-col gap-3 sm:flex-row lg:justify-end"
          >
            <button
              type="button"
              onClick={onGetStarted}
              className="inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85"
            >
              <Target className="size-4" aria-hidden="true" />
              {isAuthenticated ? 'Open dashboard' : 'Get started free'}
              <ArrowRight className="size-4" aria-hidden="true" />
            </button>
            {!isAuthenticated && (
              <button
                type="button"
                onClick={onTryDemo}
                className="ledger-control inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-5 text-sm font-medium text-foreground transition-colors"
              >
                <Eye className="size-4" aria-hidden="true" />
                Explore demo
              </button>
            )}
            <a
              href="#features"
              className="inline-flex min-h-11 items-center justify-center whitespace-nowrap px-3 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              See capabilities
            </a>
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
