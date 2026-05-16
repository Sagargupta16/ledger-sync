import { motion } from 'framer-motion'
import { Calculator, FileSpreadsheet, Wallet } from 'lucide-react'

import { rawColors } from '@/constants/colors'

export function WhatIsSection() {
  return (
    <section className="py-20 border-t border-border">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-12 items-center"
        >
          <div>
            <h2 className="text-3xl md:text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6">
              What is Ledger Sync?
            </h2>
            <p className="text-muted-foreground mb-6 leading-relaxed">
              Ledger Sync is a powerful personal finance management tool designed for the Indian
              market. It seamlessly imports your transaction data from Money Manager Pro Excel
              exports and provides comprehensive analytics.
            </p>
            <div className="space-y-4">
              <div className="flex items-start gap-4">
                <div
                  className="p-2 rounded-lg flex-shrink-0"
                  style={{ background: `${rawColors.app.blue}20` }}
                >
                  <FileSpreadsheet className="w-5 h-5" style={{ color: rawColors.app.blue }} />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Excel Import</h3>
                  <p className="text-sm text-muted-foreground">
                    Upload your Money Manager Pro exports. Smart duplicate detection ensures no
                    double entries.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div
                  className="p-2 rounded-lg flex-shrink-0"
                  style={{ background: `${rawColors.app.green}20` }}
                >
                  <Calculator className="w-5 h-5" style={{ color: rawColors.app.green }} />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">Smart Analytics</h3>
                  <p className="text-sm text-muted-foreground">
                    50/30/20 budget analysis, spending trends, income patterns, and investment
                    returns.
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-4">
                <div
                  className="p-2 rounded-lg flex-shrink-0"
                  style={{ background: `${rawColors.app.orange}20` }}
                >
                  <Wallet className="w-5 h-5" style={{ color: rawColors.app.orange }} />
                </div>
                <div>
                  <h3 className="font-semibold text-white mb-1">India-Focused</h3>
                  <p className="text-sm text-muted-foreground">
                    Fiscal year (April-March) support, INR formatting, and India-specific tax
                    planning tools.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="relative">
            <div className="glass rounded-3xl border border-border p-4 md:p-8">
              <div className="space-y-4">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <div className="text-sm text-muted-foreground">Net Worth</div>
                    <div className="text-2xl sm:text-3xl font-bold text-white">₹24,85,000</div>
                  </div>
                  <div
                    className="px-3 py-1 rounded-full text-sm"
                    style={{
                      background: `${rawColors.app.green}20`,
                      color: rawColors.app.green,
                    }}
                  >
                    +12.4%
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-xs text-muted-foreground">Income</div>
                    <div className="text-lg font-semibold text-white">₹1,25,000</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-xs text-muted-foreground">Expenses</div>
                    <div className="text-lg font-semibold text-white">₹68,500</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-xs text-muted-foreground">Savings</div>
                    <div className="text-lg font-semibold text-white">₹56,500</div>
                  </div>
                  <div className="bg-white/5 rounded-xl p-4">
                    <div className="text-xs text-muted-foreground">Investments</div>
                    <div className="text-lg font-semibold text-white">₹12,40,000</div>
                  </div>
                </div>
              </div>
            </div>
            <div
              className="absolute -top-4 -right-4 w-24 h-24 rounded-full blur-2xl opacity-50"
              style={{ background: rawColors.app.blue }}
            />
            <div
              className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full blur-2xl opacity-40"
              style={{ background: rawColors.app.purple }}
            />
          </div>
        </motion.div>
      </div>
    </section>
  )
}
