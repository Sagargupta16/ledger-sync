import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import { useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Eye, Heart, PiggyBank, Upload } from 'lucide-react'

import ThemeToggle from '@/components/layout/Sidebar/ThemeToggle'
import { AuthModal } from '@/components/shared/AuthModal'
import { ROUTES } from '@/constants'
import { enterDemoMode } from '@/lib/demo'
import { useAuthStore } from '@/store/authStore'

import { FeaturesSection } from './components/FeaturesSection'
import { Hero } from './components/Hero'
import { WhatIsSection } from './components/WhatIsSection'

export default function HomePage() {
  const [showAuthModal, setShowAuthModal] = useState(false)
  const { isAuthenticated } = useAuthStore()
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
    <div className="min-h-dvh bg-background text-foreground">
      <header
        className="sticky top-0 z-40 border-b border-border bg-[var(--header-bg)]"
        style={{
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingLeft: 'env(safe-area-inset-left, 0px)',
          paddingRight: 'env(safe-area-inset-right, 0px)',
        }}
      >
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <Link to="/" className="group flex min-h-11 items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-md bg-foreground text-background">
              <PiggyBank className="size-4.5" aria-hidden="true" />
            </div>
            <div>
              <span className="block text-sm font-semibold leading-none">Ledger Sync</span>
              <span className="mt-1 hidden text-[11px] leading-none text-muted-foreground sm:block">
                Personal finance workspace
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <ThemeToggle />
            {isAuthenticated ? (
              <Link
                to={ROUTES.DASHBOARD}
                className="inline-flex min-h-11 items-center gap-2 rounded-md bg-foreground px-3.5 text-sm font-medium text-background transition-opacity hover:opacity-85 sm:px-4"
              >
                <span className="hidden sm:inline">Open workspace</span>
                <span className="sm:hidden">Open</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setShowAuthModal(true)}
                className="inline-flex min-h-11 items-center rounded-md bg-foreground px-4 text-sm font-medium text-background transition-opacity hover:opacity-85"
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>

      <main>
        <Hero
          isAuthenticated={isAuthenticated}
          onGetStarted={handleGetStarted}
          onTryDemo={handleTryDemo}
        />
        <WhatIsSection />
        <FeaturesSection />

        <section className="border-t border-border bg-[var(--color-surface-2)] py-14 sm:py-18">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_auto] lg:items-end lg:px-8">
            <div className="max-w-2xl">
              <p className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
                Your data, one clear view
              </p>
              <h2 className="text-2xl font-semibold text-foreground sm:text-3xl">
                Ready to take control?
              </h2>
              <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
                Start tracking your finances today. It is free, private, and takes just a minute
                to set up.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleGetStarted}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-foreground px-5 text-sm font-medium text-background transition-opacity hover:opacity-85"
              >
                <Upload className="size-4" aria-hidden="true" />
                {isAuthenticated ? 'Upload your data' : 'Create free account'}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
              {!isAuthenticated && (
                <button
                  type="button"
                  onClick={handleTryDemo}
                  className="ledger-control inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-5 text-sm font-medium text-foreground transition-colors"
                >
                  <Eye className="size-4" aria-hidden="true" />
                  Explore demo
                </button>
              )}
            </div>
          </div>
        </section>

        <footer
          className="border-t border-border py-8"
          style={{ paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="mx-auto max-w-7xl px-4 text-center sm:px-6 lg:px-8">
            <p className="inline-flex items-center justify-center gap-1.5 text-sm text-text-tertiary">
              Made with
              <Heart className="size-4 fill-app-red text-app-red" aria-label="love" />
              for better financial management
            </p>
          </div>
        </footer>
      </main>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} />
    </div>
  )
}
