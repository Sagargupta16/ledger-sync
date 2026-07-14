import { Landmark, Search, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import NotificationCenter from '@/components/shared/NotificationCenter'
import { aiConfigService } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'

interface WorkspaceHeaderProps {
  title: string
}

export default function WorkspaceHeader({
  title,
}: Readonly<WorkspaceHeaderProps>) {
  const accessToken = useAuthStore((state) => state.accessToken)
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
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
        <span className="truncate text-sm font-medium text-text-secondary">
          {title}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={openSearch}
          className="hidden min-h-9 items-center gap-2 rounded-md border border-[var(--hairline-2)] bg-[var(--ledger-control-bg)] px-3 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-[var(--ledger-control-bg-hover)] hover:text-foreground sm:inline-flex"
          aria-label="Search workspace"
        >
          <Search className="size-3.5" />
          Search
          <kbd className="rounded border border-[var(--hairline-2)] bg-[var(--overlay-2)] px-1 py-0.5 text-[10px] font-medium text-text-tertiary">
            Ctrl K
          </kbd>
        </button>

        {accessToken && !isDemoMode && isAssistantReady && (
          <button
            type="button"
            onClick={openAssistant}
            className="hidden min-h-9 items-center justify-center gap-2 rounded-md border border-[var(--hairline-2)] bg-[var(--ledger-control-bg)] px-3 text-xs font-medium text-foreground transition-colors duration-150 hover:bg-[var(--ledger-control-bg-hover)] sm:inline-flex"
            aria-label="Open AI Assistant"
          >
            <Sparkles className="size-3.5" />
            <span>Ask AI</span>
          </button>
        )}

        {!isDemoMode && <NotificationCenter />}
      </div>
    </header>
  )
}
