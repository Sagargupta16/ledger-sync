import { useState, useEffect, useCallback } from 'react'
import { Sparkles } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useQuery } from '@tanstack/react-query'
import { aiConfigService } from '@/services/api/aiConfig'
import { useAuthStore } from '@/store/authStore'
import { useDemoStore } from '@/store/demoStore'
import { useChat } from './useChat'
import ChatPanel from './ChatPanel'

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const accessToken = useAuthStore((s) => s.accessToken)
  const isDemoMode = useDemoStore((s) => s.isDemoMode)

  const { data: aiConfig } = useQuery({
    queryKey: ['ai-config'],
    queryFn: () => aiConfigService.getConfig(),
    enabled: !!accessToken && !isDemoMode,
    staleTime: Infinity,
  })

  const isConfigured = aiConfig?.has_key ?? false
  const provider = aiConfig?.provider ?? null
  const model = aiConfig?.model ?? null
  const region = aiConfig?.region ?? null

  const { messages, isStreaming, error, send, stop, clear } = useChat(provider, model, region)

  const handleToggle = useCallback(() => {
    if (!isConfigured) return
    setIsOpen((prev) => !prev)
  }, [isConfigured])

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) setIsOpen(false)
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [isOpen])

  if (!accessToken || isDemoMode) return null

  return (
    <div
      className="fixed right-6 z-40"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
    >
      <AnimatePresence>
        {isOpen && isConfigured && (
          <ChatPanel
            messages={messages}
            isStreaming={isStreaming}
            error={error}
            onSend={send}
            onStop={stop}
            onClear={clear}
            onMinimize={() => setIsOpen(false)}
          />
        )}
      </AnimatePresence>

      <motion.button
        type="button"
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={handleToggle}
        title={isConfigured ? 'AI Assistant' : 'Configure AI key in Settings'}
        className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-colors ${
          isConfigured
            ? 'bg-gradient-to-br from-primary to-secondary text-white hover:shadow-primary/25'
            : 'bg-white/10 text-muted-foreground cursor-not-allowed'
        }`}
      >
        <Sparkles className="w-5 h-5" />
        {isConfigured && !isOpen && (
          <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-app-green rounded-full border-2 border-black" />
        )}
      </motion.button>
    </div>
  )
}
