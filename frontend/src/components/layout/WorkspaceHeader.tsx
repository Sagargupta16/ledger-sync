import { Landmark, Search, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'

import { Button } from '@/components/ui'
import { useQuery } from '@tanstack/react-query'

import NotificationCenter from '@/components/shared/NotificationCenter'
import { DURATION, EASING } from '@/constants/animations'
import { aiConfigService } from '@/services/api/aiConfig'
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
  const { data: aiConfig } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    enabled: Boolean(accessToken) && !isDemoMode,
    staleTime: Infinity,
  })
  const isAssistantReady =
    (aiConfig?.mode ?? 'app_bedrock') === 'app_bedrock' ||
    aiConfig?.has_key === true

  const openSearch = () => {
    document.dispatchEvent(new CustomEvent('open-command-palette'))
  }

  const openAssistant = () => {
    document.dispatchEvent(new CustomEvent('open-ai-assistant'))
  }

  return (
    <header className="relative z-20 flex min-h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b border-[var(--hairline-2)] bg-[var(--header-bg)] px-3 pt-[env(safe-area-inset-top)] pr-[max(0.75rem,env(safe-area-inset-right))] pl-[max(4rem,env(safe-area-inset-left))] lg:px-4">
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

        {accessToken && !isDemoMode && isAssistantReady && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={openAssistant}
            className="hidden px-3 text-xs sm:inline-flex"
            aria-label="Open AI Assistant"
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
            <motion.span
              initial={reduceMotion ? false : { x: '-100%' }}
              animate={reduceMotion ? { x: '100%' } : { x: ['-100%', '300%'] }}
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
