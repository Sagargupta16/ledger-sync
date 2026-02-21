import { useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import {
  PiggyBank,
  TrendingUp,
  BarChart3,
  Upload,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  Target,
  CheckCircle2,
  FileSpreadsheet,
  Calculator,
  Wallet,
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { useAuthStore } from '@/store/authStore'
import { AuthModal, LoginButton } from '@/components/shared/AuthModal'

const features = [
  {
    icon: BarChart3,
    title: 'Smart Analytics',
    description:
      '50/30/20 budget tracking, spending patterns, and income analysis with beautiful visualizations',
    color: rawColors.ios.blue,
  },
  {
    icon: TrendingUp,
    title: 'Investment Tracking',
    description:
      'Track FD/Bonds, Mutual Funds, PPF/EPF, and Stocks with returns analysis',
    color: rawColors.ios.green,
  },
  {
    icon: Shield,
    title: 'Tax Planning',
    description:
      'India FY-based tax insights, deduction tracking, and regime comparison',
    color: rawColors.ios.orange,
  },
  {
    icon: Zap,
    title: 'Instant Sync',
    description:
      'Upload Excel files with automatic duplicate detection and smart reconciliation',
    color: rawColors.ios.purple,
  },
]

const highlights = [
  'Works with Money Manager Pro exports',
  'Smart duplicate detection',
  'Secure, private data storage',
  'India-focused tax calculations',
  'Beautiful dark-mode UI',
  'Multi-account support',
]

export default function HomePage() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate(ROUTES.DASHBOARD)
    } else {
      setShowAuthModal(true)
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl bg-black/50 border-b border-border">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3 group">
            <div
              className="p-2 rounded-xl transition-transform group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
              }}
            >
              <PiggyBank className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Ledger Sync</span>
          </Link>

          {/* Auth Button */}
          <div>
            {isAuthenticated ? (
              <Link
                to={ROUTES.DASHBOARD}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white transition-colors hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                }}
              >
                <span>Hi, {user?.full_name?.split(' ')[0] || 'there'}!</span>
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <LoginButton onClick={() => setShowAuthModal(true)} />
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pt-20">
        {/* Hero Section */}
        <section className="relative overflow-hidden">
          {/* Background Effects */}
          <div className="absolute inset-0 pointer-events-none">
            <div
              className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full blur-[120px] opacity-30"
              style={{ background: rawColors.ios.blue }}
            />
            <div
              className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full blur-[100px] opacity-20"
              style={{ background: rawColors.ios.purple }}
            />
          </div>

          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-16 md:py-20 relative z-10">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center"
            >
              {/* Badge */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-border mb-8"
              >
                <Sparkles
                  className="w-4 h-4"
                  style={{ color: rawColors.ios.yellow }}
                />
                <span className="text-sm text-foreground">
                  Personal Finance Made Simple
                </span>
              </motion.div>

              {/* Title */}
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
                    backgroundImage: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.purple})`,
                  }}
                >
                  Your Finances
                </span>
              </motion.h1>

              {/* Subtitle */}
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="text-xl text-muted-foreground max-w-2xl mx-auto mb-10"
              >
                Ledger Sync is your all-in-one financial dashboard. Import your
                transactions from Excel, track investments, analyze spending
                patterns, and plan your taxes — all in one beautiful interface.
              </motion.p>

              {/* CTA Buttons */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex flex-wrap justify-center gap-4"
              >
                <button
                  onClick={handleGetStarted}
                  className="group flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 hover:shadow-xl"
                  style={{
                    background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                    boxShadow: `0 10px 30px ${rawColors.ios.blue}30`,
                  }}
                >
                  <Target className="w-5 h-5" />
                  {isAuthenticated ? 'Go to Dashboard' : 'Get Started Free'}
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </button>
                <a
                  href="#features"
                  className="flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 glass-strong border border-border-strong"
                >
                  Learn More
                </a>
              </motion.div>
            </motion.div>

            {/* Highlights */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="mt-16 flex flex-wrap justify-center gap-4"
            >
              {highlights.map((item, index) => (
                <motion.div
                  key={item}
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/5 border border-border"
                >
                  <CheckCircle2
                    className="w-4 h-4"
                    style={{ color: rawColors.ios.green }}
                  />
                  <span className="text-sm text-foreground">{item}</span>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </section>

        {/* What is Ledger Sync Section */}
        <section className="py-20 border-t border-border">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="grid md:grid-cols-2 gap-12 items-center"
            >
              {/* Text */}
              <div>
                <h2 className="text-3xl md:text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-6">
                  What is Ledger Sync?
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  Ledger Sync is a powerful personal finance management tool
                  designed for the Indian market. It seamlessly imports your
                  transaction data from Money Manager Pro Excel exports and
                  provides comprehensive analytics.
                </p>
                <div className="space-y-4">
                  <div className="flex items-start gap-4">
                    <div
                      className="p-2 rounded-lg flex-shrink-0"
                      style={{ background: `${rawColors.ios.blue}20` }}
                    >
                      <FileSpreadsheet
                        className="w-5 h-5"
                        style={{ color: rawColors.ios.blue }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">
                        Excel Import
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Upload your Money Manager Pro exports. Smart duplicate
                        detection ensures no double entries.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div
                      className="p-2 rounded-lg flex-shrink-0"
                      style={{ background: `${rawColors.ios.green}20` }}
                    >
                      <Calculator
                        className="w-5 h-5"
                        style={{ color: rawColors.ios.green }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">
                        Smart Analytics
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        50/30/20 budget analysis, spending trends, income
                        patterns, and investment returns.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div
                      className="p-2 rounded-lg flex-shrink-0"
                      style={{ background: `${rawColors.ios.orange}20` }}
                    >
                      <Wallet
                        className="w-5 h-5"
                        style={{ color: rawColors.ios.orange }}
                      />
                    </div>
                    <div>
                      <h3 className="font-semibold text-white mb-1">
                        India-Focused
                      </h3>
                      <p className="text-sm text-muted-foreground">
                        Fiscal year (April-March) support, INR formatting, and
                        India-specific tax planning tools.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Visual */}
              <div className="relative">
                <div className="glass rounded-3xl border border-border p-4 md:p-8">
                  <div className="space-y-4">
                    {/* Mock Dashboard Preview */}
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <div className="text-sm text-muted-foreground">Net Worth</div>
                        <div className="text-2xl sm:text-3xl font-bold text-white">
                          ₹24,85,000
                        </div>
                      </div>
                      <div
                        className="px-3 py-1 rounded-full text-sm"
                        style={{
                          background: `${rawColors.ios.green}20`,
                          color: rawColors.ios.green,
                        }}
                      >
                        +12.4%
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-xs text-muted-foreground">Income</div>
                        <div className="text-lg font-semibold text-white">
                          ₹1,25,000
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-xs text-muted-foreground">Expenses</div>
                        <div className="text-lg font-semibold text-white">
                          ₹68,500
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-xs text-muted-foreground">Savings</div>
                        <div className="text-lg font-semibold text-white">
                          ₹56,500
                        </div>
                      </div>
                      <div className="bg-white/5 rounded-xl p-4">
                        <div className="text-xs text-muted-foreground">Investments</div>
                        <div className="text-lg font-semibold text-white">
                          ₹12,40,000
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Decorative elements */}
                <div
                  className="absolute -top-4 -right-4 w-24 h-24 rounded-full blur-2xl opacity-50"
                  style={{ background: rawColors.ios.blue }}
                />
                <div
                  className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full blur-2xl opacity-40"
                  style={{ background: rawColors.ios.purple }}
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 border-t border-border">
          <div className="max-w-6xl mx-auto px-6">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              className="text-center mb-12"
            >
              <div className="flex items-center justify-center gap-2 mb-3">
                <Sparkles
                  className="w-5 h-5"
                  style={{ color: rawColors.ios.yellow }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: rawColors.ios.yellow }}
                >
                  Features
                </span>
              </div>
              <h2 className="text-3xl md:text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                Everything You Need
              </h2>
              <p className="text-muted-foreground max-w-2xl mx-auto">
                Powerful features designed to give you complete visibility into
                your finances
              </p>
            </motion.div>

            <div className="grid md:grid-cols-2 gap-6">
              {features.map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                  className="flex items-start gap-4 p-6 rounded-2xl glass border border-border hover:border-border-strong transition-colors"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: `${feature.color}20` }}
                  >
                    <feature.icon
                      className="w-6 h-6"
                      style={{ color: feature.color }}
                    />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white mb-1">
                      {feature.title}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 border-t border-border">
          <div className="max-w-4xl mx-auto px-6 text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <h2 className="text-3xl md:text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-4">
                Ready to Take Control?
              </h2>
              <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
                Start tracking your finances today. It's free, private, and
                takes just a minute to get started.
              </p>
              <button
                onClick={handleGetStarted}
                className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 hover:shadow-xl"
                style={{
                  background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                  boxShadow: `0 10px 30px ${rawColors.ios.blue}30`,
                }}
              >
                <Upload className="w-5 h-5" />
                {isAuthenticated ? 'Upload Your Data' : 'Create Free Account'}
                <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
              </button>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="py-8 border-t border-border">
          <div className="max-w-6xl mx-auto px-6 text-center">
            <p className="text-sm text-text-tertiary">
              Made with ❤️ for better financial management
            </p>
          </div>
        </footer>
      </main>

      {/* Auth Modal */}
      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}
