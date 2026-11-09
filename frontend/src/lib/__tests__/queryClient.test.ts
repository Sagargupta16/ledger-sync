import { MutationObserver } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'

import { markErrorReported, queryClient } from '@/lib/queryClient'

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

function failingObserver() {
  const observer = new MutationObserver(queryClient, {
    mutationFn: () => Promise.reject(new Error('Server said no')),
  })
  // Per-call callbacks only run while something observes the mutation.
  const unsubscribe = observer.subscribe(() => undefined)
  return { observer, unsubscribe }
}

/** The global fallback waits one task for callers to claim the error. */
const nextTask = () => new Promise((resolve) => setTimeout(resolve, 0))

afterEach(() => {
  vi.mocked(toast.error).mockClear()
  queryClient.clear()
})

describe('global mutation error toast', () => {
  it('toasts a failure nobody reported', async () => {
    const { observer, unsubscribe } = failingObserver()
    await observer.mutate(undefined).catch(() => undefined)
    await nextTask()
    expect(toast.error).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('stays quiet when a per-call onError reported it', async () => {
    const { observer, unsubscribe } = failingObserver()
    await observer
      .mutate(undefined, { onError: (error) => markErrorReported(error) })
      .catch(() => undefined)
    await nextTask()
    expect(toast.error).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('stays quiet when the awaiting caller reported it inline', async () => {
    const { observer, unsubscribe } = failingObserver()
    try {
      await observer.mutate(undefined)
    } catch (error) {
      markErrorReported(error)
    }
    await nextTask()
    expect(toast.error).not.toHaveBeenCalled()
    unsubscribe()
  })

  it('runs saves while the browser reports offline instead of pausing them', () => {
    expect(queryClient.getDefaultOptions().mutations?.networkMode).toBe('always')
  })
})
