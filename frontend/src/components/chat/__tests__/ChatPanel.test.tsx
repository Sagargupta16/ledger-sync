import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import ChatPanel from '../ChatPanel'

// jsdom doesn't implement Element.scrollTo; the panel calls it on message
// changes. Stub it so the effect is a no-op in tests.
Element.prototype.scrollTo = Element.prototype.scrollTo || (() => {})

function renderPanel(onSend = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={qc}>
      <ChatPanel
        messages={[]}
        isStreaming={false}
        error={null}
        onSend={onSend}
        onStop={vi.fn()}
        onClear={vi.fn()}
        onMinimize={vi.fn()}
      />
    </QueryClientProvider>,
  )
  return onSend
}

describe('ChatPanel empty state', () => {
  it('greets and renders the three quick-action suggestions', () => {
    renderPanel()
    expect(screen.getByText('Hey there!')).toBeInTheDocument()
    expect(screen.getByText('Break down my spending')).toBeInTheDocument()
    expect(screen.getByText('Review my recurring bills')).toBeInTheDocument()
    expect(screen.getByText('Check my savings health')).toBeInTheDocument()
  })

  it('clicking a suggestion sends its full prompt', () => {
    const onSend = renderPanel()
    fireEvent.click(screen.getByText('Break down my spending'))
    expect(onSend).toHaveBeenCalledWith(
      'What are my top expense categories this month, and how do they compare to last month?',
    )
  })

  it('send button explains itself when input is empty', () => {
    renderPanel()
    expect(screen.getByLabelText('Send message')).toHaveAttribute(
      'title',
      'Type a message first',
    )
  })
})
