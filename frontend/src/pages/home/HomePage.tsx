import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { ArrowRight, Eye, PiggyBank, Upload } from 'lucide-react'

import { AuthModal, LoginButton } from '@/components/shared/AuthModal'
import { ROUTES } from '@/constants'
import { rawColors } from '@/constants/colors'
import { enterDemoMode } from '@/lib/demo'
import { useAuthStore } from '@/store/authStore'

import { FeaturesSection } from './components/FeaturesSection'
import { Hero } from './components/Hero'
import { WhatIsSection } from './components/WhatIsSection'

export default function HomePage() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { isAuthenticated, user } = useAuthStore()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const handleGetStarted = () => {
    if (isAuthenticated) {
      navigate(ROUTES.DASHBOARD)
    } else {
      setShowAuthModal(true)
    }
  }

  const handleTryDemo = () => enterDemoMode(queryClient, navigate)

  return (
    <div className="min-h-dvh flex flex-col">
      <header
        className="fixed top-0 left-0 right-0 z-40 backdrop-blur-xl bg-black/50 border-b border-border"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 group">
            <div
              className="p-2 rounded-xl transition-transform group-hover:scale-105"
              style={{
                background: `linear-gradient(135deg, ${rawColors.app.blue}, ${rawColors.app.indigo})`,
              }}
            >
              <PiggyBank className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Ledger Sync</span>
          </Link>

          <div>
            {isAuthenticated ? (
              <Link
                to={ROUTES.DASHBOARD}
                className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white transition-colors hover:scale-105"
                style={{
                  background: `linear-gradient(135deg, ${rawColors.app.blue}, ${rawColors.app.indigo})`,
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

      <main
        className="flex-1"
        style={{ paddingTop: 'calc(5rem + env(safe-area-inset-top, 0px))' }}
      >
        <Hero
          isAuthenticated={isAuthenticated}
          onGetStarted={handleGetStarted}
          onTryDemo={handleTryDemo}
        />
        <WhatIsSection />
        <FeaturesSection />

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
                Start tracking your finances today. It's free, private, and takes just a minute
                to get started.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <button
                  onClick={handleGetStarted}
                  className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 hover:shadow-xl hover:shadow-[0_15px_40px_rgba(74,158,255,0.4)]"
                  style={{
                    background: `linear-gradient(135deg, ${rawColors.app.blue}, ${rawColors.app.indigo})`,
                    boxShadow: `0 10px 30px ${rawColors.app.blue}50`,
                  }}
                >
                  <Upload className="w-5 h-5" />
                  {isAuthenticated ? 'Upload Your Data' : 'Create Free Account'}
                  <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
                </button>
                {!isAuthenticated && (
                  <button
                    onClick={handleTryDemo}
                    className="group inline-flex items-center gap-2 px-8 py-4 rounded-2xl font-semibold text-white transition-[color,background-color,border-color,transform,box-shadow] duration-300 hover:scale-105 glass-strong border border-border-strong"
                  >
                    <Eye className="w-5 h-5" />
                    Try Demo
                  </button>
                )}
              </div>
            </motion.div>
          </div>
        </section>

        <footer
          className="py-8 border-t border-border"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-6xl mx-auto px-6 text-center">
            <p className="text-sm text-text-tertiary">
              Made with ❤️ for better financial management
            </p>
          </div>
        </footer>
      </main>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}
