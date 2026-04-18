import { memo } from 'react'
import { User, Sparkles } from 'lucide-react'
import type { ChatMessage as ChatMessageType } from '@/lib/chatAdapters'

function ChatMessageComponent({ message }: Readonly<{ message: ChatMessageType }>) {
  const isUser = message.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div
        className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
          isUser ? 'bg-primary/20' : 'bg-white/10'
        }`}
      >
        {isUser ? (
          <User className="w-3.5 h-3.5 text-primary" />
        ) : (
          <Sparkles className="w-3.5 h-3.5 text-app-purple" />
        )}
      </div>
      <div
        className={`max-w-[80%] px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
          isUser
            ? 'bg-primary/15 text-white rounded-br-md'
            : 'bg-white/[0.06] text-foreground rounded-bl-md'
        }`}
      >
        {message.content || (
          <span className="inline-flex gap-1">
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.15s]" />
            <span className="w-1.5 h-1.5 bg-white/40 rounded-full animate-bounce [animation-delay:0.3s]" />
          </span>
        )}
      </div>
    </div>
  )
}

export default memo(ChatMessageComponent)
