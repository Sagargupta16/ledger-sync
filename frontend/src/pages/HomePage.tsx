import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { 
  PiggyBank, 
  TrendingUp, 
  BarChart3, 
  Receipt, 
  Upload,
  ArrowRight,
  Sparkles,
  Shield,
  Zap,
  Target
} from 'lucide-react'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'

const features = [
  {
    icon: BarChart3,
    title: 'Smart Analytics',
    description: '50/30/20 budget tracking, spending patterns, and income analysis',
    color: rawColors.ios.blue,
  },
  {
    icon: TrendingUp,
    title: 'Investment Tracking',
    description: 'Track FD/Bonds, Mutual Funds, PPF/EPF, and Stocks in one place',
    color: rawColors.ios.green,
  },
  {
    icon: Shield,
    title: 'Tax Planning',
    description: 'India FY-based tax insights and deduction tracking',
    color: rawColors.ios.orange,
  },
  {
    icon: Zap,
    title: 'Instant Sync',
    description: 'Upload Excel files with automatic duplicate detection',
    color: rawColors.ios.purple,
  },
]

const quickActions = [
  { 
    path: ROUTES.DASHBOARD, 
    label: 'Dashboard', 
    icon: BarChart3, 
    description: 'View your financial overview',
    gradient: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
  },
  { 
    path: ROUTES.UPLOAD, 
    label: 'Upload Data', 
    icon: Upload, 
    description: 'Import your transactions',
    gradient: `linear-gradient(135deg, ${rawColors.ios.green}, ${rawColors.ios.teal})`,
  },
  { 
    path: ROUTES.SPENDING_ANALYSIS, 
    label: 'Spending', 
    icon: Receipt, 
    description: 'Analyze your expenses',
    gradient: `linear-gradient(135deg, ${rawColors.ios.orange}, ${rawColors.ios.red})`,
  },
  { 
    path: ROUTES.NET_WORTH, 
    label: 'Net Worth', 
    icon: PiggyBank, 
    description: 'Track your wealth',
    gradient: `linear-gradient(135deg, ${rawColors.ios.purple}, ${rawColors.ios.pink})`,
  },
]

export default function HomePage() {
  return (
    <div className="min-h-screen p-8 flex flex-col">
      <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col">
        {/* Hero Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-16"
        >
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="flex justify-center mb-8"
          >
            <div 
              className="p-5 rounded-3xl shadow-2xl"
              style={{ 
                background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                boxShadow: `0 20px 60px ${rawColors.ios.blue}40`
              }}
            >
              <PiggyBank className="w-16 h-16 text-white" />
            </div>
          </motion.div>

          {/* Title */}
          <motion.h1
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="text-5xl md:text-6xl font-bold mb-4"
          >
            <span className="bg-gradient-to-r from-white via-white to-gray-400 bg-clip-text text-transparent">
              Welcome to{' '}
            </span>
            <span 
              className="bg-clip-text text-transparent"
              style={{ 
                backgroundImage: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.purple})` 
              }}
            >
              Ledger Sync
            </span>
          </motion.h1>

          {/* Subtitle */}
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-xl text-gray-400 max-w-2xl mx-auto mb-8"
          >
            Your personal finance command center. Track expenses, analyze investments, 
            and take control of your financial future.
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="flex flex-wrap justify-center gap-4"
          >
            <Link
              to={ROUTES.DASHBOARD}
              className="group flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-all duration-300 hover:scale-105 hover:shadow-xl"
              style={{ 
                background: `linear-gradient(135deg, ${rawColors.ios.blue}, ${rawColors.ios.indigo})`,
                boxShadow: `0 10px 30px ${rawColors.ios.blue}30`
              }}
            >
              <Target className="w-5 h-5" />
              Go to Dashboard
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
            <Link
              to={ROUTES.UPLOAD}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-all duration-300 hover:scale-105 glass-strong border border-white/20"
            >
              <Upload className="w-5 h-5" />
              Upload Data
            </Link>
          </motion.div>
        </motion.div>

        {/* Quick Actions Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="mb-16"
        >
          <h2 className="text-2xl font-semibold text-white mb-6 text-center">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {quickActions.map((action, index) => (
              <motion.div
                key={action.path}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 + index * 0.1 }}
              >
                <Link
                  to={action.path}
                  className="group block p-6 rounded-2xl glass border border-white/10 hover:border-white/20 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl"
                >
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110"
                    style={{ background: action.gradient }}
                  >
                    <action.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-semibold text-white mb-1">{action.label}</h3>
                  <p className="text-sm text-gray-400">{action.description}</p>
                </Link>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Features Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="mb-16"
        >
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Sparkles className="w-5 h-5" style={{ color: rawColors.ios.yellow }} />
              <span className="text-sm font-medium" style={{ color: rawColors.ios.yellow }}>
                Features
              </span>
            </div>
            <h2 className="text-3xl font-bold text-white">Everything you need</h2>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + index * 0.1 }}
                className="flex items-start gap-4 p-6 rounded-2xl glass border border-white/10"
              >
                <div 
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: `${feature.color}20` }}
                >
                  <feature.icon className="w-6 h-6" style={{ color: feature.color }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-white mb-1">{feature.title}</h3>
                  <p className="text-sm text-gray-400">{feature.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="text-center py-8 border-t border-white/10 mt-auto"
        >
          <p className="text-sm text-gray-500">
            Made with ❤️ for better financial management
          </p>
        </motion.div>
      </div>
    </div>
  )
}
