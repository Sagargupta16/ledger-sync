import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMotionStore } from '@/store/motionStore'

import { useCountUp } from '../useCountUp'

describe('useCountUp', () => {
  let nextFrameId: number
  let frames: Map<number, FrameRequestCallback>

  beforeEach(() => {
    nextFrameId = 1
    frames = new Map()
    useMotionStore.getState().setMode('full')

    vi.spyOn(performance, 'now').mockReturnValue(0)
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++
      frames.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
      frames.delete(id)
    })
  })

  afterEach(() => {
    useMotionStore.getState().setMode('full')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  function runNextFrame(timestamp: number) {
    const entry = frames.entries().next()
    if (entry.done) throw new Error('Expected a pending animation frame')

    const [id, callback] = entry.value
    frames.delete(id)
    callback(timestamp)
  }

  it('does not regress after reduced mode interrupts an active count-up', () => {
    const { result } = renderHook(() => useCountUp(100, 1000))

    act(() => runNextFrame(500))
    expect(result.current).toBeGreaterThan(0)
    expect(result.current).toBeLessThan(100)

    act(() => useMotionStore.getState().setMode('reduced'))
    expect(result.current).toBe(100)

    act(() => useMotionStore.getState().setMode('full'))
    expect(result.current).toBe(100)

    act(() => runNextFrame(100))
    expect(result.current).toBe(100)
  })
})
