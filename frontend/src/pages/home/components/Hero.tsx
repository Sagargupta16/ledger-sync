import { motion } from 'framer-motion'
import { ArrowRight, CheckCircle2, Eye, Sparkles, Target } from 'lucide-react'

import { rawColors } from '@/constants/colors'

const HIGHLIGHTS = [
  'Works with Money Manager Pro exports',
  'Smart duplicate detection',
  'Secure, private data storage',
  'India-focused tax calculations',
  'Beautiful dark-mode UI',
  'Multi-account support',
]

interface HeroProps {
  isAuthenticated: boolean
  onGetStarted: () => void
  onTryDemo: () => void
}

export function Hero({ isAuthenticated, onGetStarted, onTryDemo }: Readonly<HeroProps>) {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] opacity-30"
          style={{ background: rawColors.app.blue }}
        />
        <div
          className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] opacity-20"
          style={{ background: rawColors.app.purple }}
        />
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 md:py-20 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-border mb-8"
          >
            <Sparkles className="w-4 h-4" style={{ color: rawColors.app.yellow }} />
            <span className="text-sm text-foreground">Personal Finance Made Simple</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-3xl sm:text-4xl md:text-5xl lg:text-7xl font-bold mb-4 sm:mb-6"
          >
            <span className="bg-gradient-to-r from-white via-white to-muted-foreground bg-clip-text text-transparent">
              Take Control of{' '}
            </span>
            <br />
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage: `linear-gradient(135deg, ${rawColors.app.blue}, ${rawColors.app.purple})`,
              }}
            >
              Your Finances
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
          >
            Ledger Sync is your all-in-one financial dashboard. Import your transactions from
            Excel, track investments, analyze spending patterns, and plan your taxes — all in
            one beautiful interface.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap justify-center gap-4"
          >
            <button
              onClick={onGetStarted}
              className="group flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[0_15px_40px_rgba(74,158,255,0.4)]"
              style={{
                background: `linear-gradient(135deg, ${rawColors.app.blue}, ${rawColors.app.indigo})`,
                boxShadow: `0 10px 30px ${rawColors.app.blue}50`,
              }}
            >
              <Target className="w-5 h-5" />
              {isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </button>
            {!isAuthenticated && (
              <button
                onClick={onTryDemo}
                className="group flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 glass-strong border border-border-strong"
              >
                <Eye className="w-5 h-5" />
                Try Demo
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            )}
            <a
              href="#features"
              className="group flex items-center gap-2 px-6 py-4 min-h-[44px] rounded-2xl font-medium text-muted-foreground hover:text-white hover:bg-white/[0.06] transition-[color,background-color,transform] duration-300 hover:scale-105"
            >
              Learn More
            </a>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mt-16 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
        >
          {HIGHLIGHTS.map((item, index) => (
            <motion.div
              key={item}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 + index * 0.05 }}
              className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-border"
            >
              <CheckCircle2 className="w-4 h-4" style={{ color: rawColors.app.green }} />
              <span className="text-sm text-foreground">{item}</span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
