import { motion } from 'motion/react'
import { Calculator, FileSpreadsheet, Wallet } from 'lucide-react'

import { sectionReveal, slideInLeftItem, staggerContainer } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

import { SampleWorkspacePanel } from './SampleWorkspacePanel'

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

export function WhatIsSection() {
  const reduce = useMotionStore((state) => state.mode === 'reduced')

  return (
    <section className="border-b border-border py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,0.82fr)_minmax(0,1.18fr)] lg:gap-20">
          <div>
            <p className="ledger-meta mb-3 text-muted-foreground">
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
              initial={reduce ? false : 'hidden'}
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
            className="min-w-0 self-center"
            variants={sectionReveal}
            initial={reduce ? false : 'hidden'}
            whileInView="visible"
            viewport={{ once: true, margin: '-80px' }}
          >
            <SampleWorkspacePanel />
          </motion.div>
        </div>
      </div>
    </section>
  )
}
