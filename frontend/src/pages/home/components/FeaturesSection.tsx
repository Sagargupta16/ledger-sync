import { motion } from 'motion/react'
import {
  ArrowRight,
  BarChart3,
  MessageSquareText,
  Shield,
  Split,
  TrendingUp,
  Zap,
  type LucideIcon,
} from 'lucide-react'

import { ROUTES } from '@/constants'
import { fadeUpItem, staggerContainer } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

interface Feature {
  icon: LucideIcon
  title: string
  description: string
  /** Demo page that shows this feature; null when the demo cannot show it. */
  route: string | null
  page: string
  iconClass: string
}

const FEATURES: readonly Feature[] = [
  {
    icon: Split,
    title: 'Cash flow map',
    description:
      'Follow income into spending, savings, investments and tax, then drill into any branch.',
    route: ROUTES.INCOME_EXPENSE_FLOW,
    page: 'Cash Flow',
    iconClass: 'text-income',
  },
  {
    icon: BarChart3,
    title: 'Smart analytics',
    description:
      '50/30/20 budget tracking, spending patterns, and income analysis with clear visualizations.',
    route: ROUTES.SPENDING_ANALYSIS,
    page: 'Expense Analysis',
    iconClass: 'text-app-blue',
  },
  {
    icon: TrendingUp,
    title: 'Investment tracking',
    description: 'Track FD and bonds, mutual funds, PPF and EPF, and stocks with returns analysis.',
    route: ROUTES.INVESTMENT_ANALYTICS,
    page: 'Investment Analytics',
    iconClass: 'text-investment',
  },
  {
    icon: Shield,
    title: 'Tax planning',
    description:
      'Review India FY-based tax insights, deduction tracking, regime comparison, and RSU vesting.',
    route: ROUTES.TAX_PLANNING,
    page: 'Income Tax',
    iconClass: 'text-app-orange',
  },
  {
    icon: Zap,
    title: 'Instant sync',
    description:
      'Upload Excel or CSV files with automatic duplicate detection and smart reconciliation.',
    route: ROUTES.TRANSACTIONS,
    page: 'Transactions',
    iconClass: 'text-savings',
  },
  {
    icon: MessageSquareText,
    title: 'AI assistant',
    description:
      'Ask about your money in plain language. Fifteen read-only tools answer from your own ledger.',
    route: null,
    page: 'workspace',
    iconClass: 'text-app-blue',
  },
]

function actionLabel(feature: Feature, isAuthenticated: boolean): string {
  if (feature.route === null) return isAuthenticated ? 'Open workspace' : 'Sign in to use it'
  return isAuthenticated ? `Open ${feature.page}` : `See ${feature.page} in demo`
}

interface FeaturesSectionProps {
  isAuthenticated: boolean
  onOpenFeature: (route: string | null) => void
}

export function FeaturesSection({ isAuthenticated, onOpenFeature }: Readonly<FeaturesSectionProps>) {
  const reduce = useMotionStore((state) => state.mode === 'reduced')

  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 pb-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="ledger-meta mb-3 text-muted-foreground">Capabilities</p>
            <h2 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Everything you need
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            A complete set of focused tools for understanding daily money movement, long-term
            wealth, and upcoming obligations. Every card opens the page that shows it.
          </p>
        </div>

        <motion.ul
          className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-3"
          variants={staggerContainer}
          initial={reduce ? false : 'hidden'}
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {FEATURES.map((feature, index) => (
            <motion.li
              key={feature.title}
              variants={fadeUpItem}
              className="group relative flex flex-col gap-2.5 bg-background px-4 pt-4 pb-1 transition-colors hover:bg-[var(--color-surface-1)] sm:gap-3 sm:px-6 sm:pt-6 sm:pb-2"
            >
              <div className="flex items-center gap-3">
                <span
                  className={`flex size-9 shrink-0 items-center justify-center rounded-md bg-[var(--overlay-3)] transition-transform duration-200 group-hover:-translate-y-0.5 ${feature.iconClass}`}
                >
                  <feature.icon className="size-4.5" aria-hidden="true" />
                </span>
                <h3 className="min-w-0 flex-1 text-base font-semibold text-foreground">
                  {feature.title}
                </h3>
                <span className="ledger-meta text-text-tertiary" aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
              </div>
              <p className="max-w-md text-sm leading-6 text-muted-foreground">
                {feature.description}
              </p>
              <button
                type="button"
                onClick={() => onOpenFeature(feature.route)}
                className="mt-auto inline-flex min-h-11 items-center gap-1.5 self-start text-sm font-medium text-app-blue after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-[var(--focus-ring)]"
              >
                {actionLabel(feature, isAuthenticated)}
                <ArrowRight
                  className="size-4 transition-transform duration-200 group-hover:translate-x-1"
                  aria-hidden="true"
                />
              </button>
            </motion.li>
          ))}
        </motion.ul>
      </div>
    </section>
  )
}
