import { motion } from 'framer-motion'
import { BarChart3, Shield, TrendingUp, Zap } from 'lucide-react'

import { staggerContainer, fadeUpItem } from '@/constants/animations'

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Smart analytics',
    description:
      '50/30/20 budget tracking, spending patterns, and income analysis with clear visualizations.',
    iconClass: 'bg-[var(--overlay-3)] text-app-blue',
  },
  {
    icon: TrendingUp,
    title: 'Investment tracking',
    description: 'Track FD and bonds, mutual funds, PPF and EPF, and stocks with returns analysis.',
    iconClass: 'bg-[var(--overlay-3)] text-income',
  },
  {
    icon: Shield,
    title: 'Tax planning',
    description: 'Review India FY-based tax insights, deduction tracking, and regime comparison.',
    iconClass: 'bg-[var(--overlay-3)] text-app-orange',
  },
  {
    icon: Zap,
    title: 'Instant sync',
    description:
      'Upload Excel files with automatic duplicate detection and smart reconciliation.',
    iconClass: 'bg-[var(--overlay-3)] text-savings',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="scroll-mt-20 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-4 border-b border-border pb-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-end">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              Capabilities
            </p>
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              Everything you need
            </h2>
          </div>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground lg:justify-self-end">
            A complete set of focused tools for understanding daily money movement, long-term
            wealth, and upcoming obligations.
          </p>
        </div>

        <motion.div
          className="grid md:grid-cols-2"
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: '-80px' }}
        >
          {FEATURES.map((feature) => (
            <motion.div
              key={feature.title}
              variants={fadeUpItem}
              className="flex min-h-40 items-start gap-4 border-b border-border py-7 md:px-7 md:even:border-l md:odd:pl-0 md:even:pr-0"
            >
              <div
                className={`flex size-10 shrink-0 items-center justify-center rounded-md ${feature.iconClass}`}
              >
                <feature.icon className="size-4.5" aria-hidden="true" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">{feature.title}</h3>
                <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
