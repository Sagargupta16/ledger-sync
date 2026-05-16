import { motion } from 'framer-motion'
import { BarChart3, Shield, Sparkles, TrendingUp, Zap } from 'lucide-react'

import { rawColors } from '@/constants/colors'

const FEATURES = [
  {
    icon: BarChart3,
    title: 'Smart Analytics',
    description:
      '50/30/20 budget tracking, spending patterns, and income analysis with beautiful visualizations',
    color: rawColors.app.blue,
  },
  {
    icon: TrendingUp,
    title: 'Investment Tracking',
    description: 'Track FD/Bonds, Mutual Funds, PPF/EPF, and Stocks with returns analysis',
    color: rawColors.app.green,
  },
  {
    icon: Shield,
    title: 'Tax Planning',
    description: 'India FY-based tax insights, deduction tracking, and regime comparison',
    color: rawColors.app.orange,
  },
  {
    icon: Zap,
    title: 'Instant Sync',
    description:
      'Upload Excel files with automatic duplicate detection and smart reconciliation',
    color: rawColors.app.purple,
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="py-20 border-t border-border">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <div className="flex items-center justify-center gap-2 mb-3">
            <Sparkles className="w-5 h-5" style={{ color: rawColors.app.yellow }} />
            <span className="text-sm font-medium" style={{ color: rawColors.app.yellow }}>
              Features
            </span>
          </div>
          <h2 className="text-3xl md:text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
            Everything You Need
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Powerful features designed to give you complete visibility into your finances
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {FEATURES.map((feature, index) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex items-start gap-4 p-6 rounded-2xl glass border border-border hover:border-border-strong hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/20 transition-all duration-300"
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: `${feature.color}20` }}
              >
                <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
