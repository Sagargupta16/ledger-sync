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

  const mode = aiConfig?.mode ?? 'app_bedrock'
  const provider = aiConfig?.provider ?? null
  const model = aiConfig?.model ?? null
  const region = aiConfig?.region ?? null
  // App mode is always ready (no key required); BYOK needs a stored key.
  const isConfigured = mode === 'app_bedrock' ? true : aiConfig?.has_key === true

  const { messages, isStreaming, error, send, stop, clear } = useChat(
    mode,
    provider,
    model,
    region,
  )

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
      className="fixed z-40"
      style={{
        // Park the widget above the iOS home bar and clear any right-edge
        // safe-area inset (landscape on notched devices).
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
        right: 'calc(env(safe-area-inset-right, 0px) + 1.5rem)',
      }}
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
