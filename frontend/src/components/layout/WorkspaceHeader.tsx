import { Landmark, Search, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui'

import NotificationCenter from '@/components/shared/NotificationCenter'
import { DURATION, EASING } from '@/constants/animations'
import { aiUnavailableReason, isAiReady, useAiAvailability } from '@/hooks/api/useAiAvailability'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useMotionStore } from '@/store/motionStore'

interface WorkspaceHeaderProps {
  title: string
  pendingTitle?: string
}

export default function WorkspaceHeader({
  title,
  pendingTitle,
}: Readonly<WorkspaceHeaderProps>) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  const availability = useAiAvailability()
  const isAssistantReady = isAiReady(availability)
  const unavailableReason = aiUnavailableReason(availability)
  // A key or model still to choose is set up in Settings, not here, so the
  // button stays hidden as before; loading shows it disabled, an error retries.
  const showAssistant =
    isAssistantReady || availability.kind === 'loading' || availability.kind === 'error'

  const openSearch = () => {
    document.dispatchEvent(new CustomEvent('open-command-palette'))
  }

  const openAssistant = () => {
    if (availability.kind === 'error') {
      availability.retry()
      return
    }
    if (isAssistantReady) document.dispatchEvent(new CustomEvent('open-ai-assistant'))
  }

  return (
    <header className="relative z-20 flex min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-[var(--hairline-2)] bg-[var(--header-bg)] px-3 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[calc(4rem+env(safe-area-inset-left,0px))] lg:px-4">
      <div className={`flex min-w-0 items-center gap-2.5 ${isDemoMode ? 'invisible sm:visible' : ''}`}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-[var(--hairline-2)] bg-[var(--overlay-2)] text-text-secondary">
          <Landmark className="size-3.5" />
        </span>
        <motion.span
          key={title}
          initial={reduceMotion ? false : { opacity: 0.7, y: 3 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
          className="truncate text-sm font-medium text-text-secondary"
        >
          {title}
        </motion.span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={openSearch}
          className="hidden px-3 text-xs text-muted-foreground hover:text-foreground sm:inline-flex"
          aria-label="Search workspace"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="rounded border border-[var(--hairline-2)] bg-[var(--overlay-2)] px-1 py-0.5 text-[10px] font-medium text-text-tertiary">
            Ctrl K
          </kbd>
        </Button>

        {accessToken && !isDemoMode && showAssistant && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openAssistant}
            disabled={availability.kind === 'loading'}
            title={unavailableReason ? `${unavailableReason}${availability.kind === 'error' ? ' (click to retry)' : ''}` : undefined}
            className="hidden px-3 text-xs sm:inline-flex"
            aria-label={isAssistantReady ? 'Open AI Assistant' : `AI Assistant unavailable -- ${unavailableReason ?? 'not ready'}`}
          >
            <Sparkles className="size-3.5" />
            <span>Ask AI</span>
          </Button>
        )}

        {!isDemoMode && <NotificationCenter />}
      </div>

      <output
        aria-live="polite"
        aria-atomic="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 overflow-hidden"
      >
        <span className="sr-only">{pendingTitle ? `Opening ${pendingTitle}` : ''}</span>
        {pendingTitle && (
          <span aria-hidden="true" className="absolute inset-0 bg-primary/10">
            {/* A whole transform string, not `x`: Motion hands it straight to
                WAAPI, so the loop never falls back to its per-frame JS. */}
            <motion.span
              initial={reduceMotion ? false : { transform: 'translateX(-100%)' }}
              animate={reduceMotion
                ? { transform: 'translateX(100%)' }
                : { transform: ['translateX(-100%)', 'translateX(300%)'] }}
              transition={reduceMotion
                ? { duration: 0 }
                : { duration: 1.4, ease: 'linear', repeat: Infinity }}
              className="absolute inset-y-0 left-0 w-1/3 rounded-full bg-primary/70"
            />
          </span>
        )}
      </output>
    </header>
  )
}
