import { motion } from 'framer-motion'
import { Calculator, FileSpreadsheet, Wallet } from 'lucide-react'

import { sectionReveal, slideInLeftItem, staggerContainer } from '@/constants/animations'

const WORKFLOWS = [
  {
    icon: FileSpreadsheet,
    title: 'Excel import',
    description:
      'Upload Money Manager Pro exports. Smart duplicate detection prevents double entries.',
    iconClass: 'bg-[var(--overlay-3)] text-app-blue',
  },
  {
    icon: Calculator,
    title: 'Smart analytics',
    description:
      'Review 50/30/20 budgets, spending trends, income patterns, and investment returns.',
    iconClass: 'bg-[var(--overlay-3)] text-income',
  },
  {
    icon: Wallet,
    title: 'India-focused planning',
    description:
      'Work with April-March fiscal years, INR formatting, and India-specific tax tools.',
    iconClass: 'bg-[var(--overlay-3)] text-app-orange',
  },
]

const SNAPSHOT_METRICS = [
  { label: 'Income', value: 'INR 1,25,000' },
  { label: 'Expenses', value: 'INR 68,500' },
  { label: 'Savings', value: 'INR 56,500' },
  { label: 'Investments', value: 'INR 12,40,000' },
]

export function WhatIsSection() {
  return (
    <section className="border-b border-border py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-20">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
              One reliable ledger
            </p>
            <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
              What is Ledger Sync?
            </h2>
            <p className="mt-4 max-w-xl text-base leading-7 text-muted-foreground">
              Ledger Sync is a personal finance management tool designed for the Indian market.
              It imports Money Manager Pro transaction data and turns it into structured,
              decision-ready analytics.
            </p>

            <motion.div
              className="mt-8 divide-y divide-border border-y border-border"
              variants={staggerContainer}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true, margin: '-80px' }}
            >
              {WORKFLOWS.map((workflow) => (
                <motion.div key={workflow.title} variants={slideInLeftItem} className="flex gap-4 py-5">
                  <div
                    className={`flex size-9 shrink-0 items-center justify-center rounded-md ${workflow.iconClass}`}
                  >
                    <workflow.icon className="size-4.5" aria-hidden="true" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">{workflow.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-muted-foreground">
                      {workflow.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>

          <motion.div
            className="self-center"
            variants={sectionReveal}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            <div className="ledger-panel">
              <div className="flex items-end justify-between gap-4 border-b border-border p-5 sm:p-6">
                <div>
                  <p className="text-sm text-muted-foreground">Net worth</p>
                  <p className="mt-1 text-2xl font-semibold tabular-nums text-foreground sm:text-3xl">
                    INR 24,85,000
                  </p>
                </div>
                <div className="rounded-md bg-[var(--overlay-3)] px-2.5 py-1 text-sm font-medium text-income">
                  +12.4%
                </div>
              </div>

              <div className="grid grid-cols-2 bg-[var(--ledger-grid-line)]">
                {SNAPSHOT_METRICS.map((metric) => (
                  <div
                    key={metric.label}
                    className="ledger-cell border-b border-r border-border p-4 even:border-r-0 sm:p-5 [&:nth-child(n+3)]:border-b-0"
                  >
                    <p className="text-xs text-muted-foreground">{metric.label}</p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-foreground sm:text-lg">
                      {metric.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground sm:px-6">
                <span>Latest synced snapshot</span>
                <span>Duplicate-safe import</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
