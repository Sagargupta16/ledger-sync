import { afterEach, describe, expect, it } from 'vitest'

import {
  MOTION_STORAGE_KEY,
  isMotionReduced,
  useMotionStore,
} from '@/store/motionStore'

afterEach(() => {
  useMotionStore.getState().setMode('full')
  localStorage.removeItem(MOTION_STORAGE_KEY)
})

describe('motionStore', () => {
  it('persists reduced motion and updates the document contract', () => {
    useMotionStore.getState().setMode('reduced')

    expect(isMotionReduced()).toBe(true)
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('reduced')
    expect(document.documentElement.dataset.motion).toBe('reduced')
  })

  it('restores full motion', () => {
    useMotionStore.getState().setMode('reduced')
    useMotionStore.getState().setMode('full')

    expect(isMotionReduced()).toBe(false)
    expect(localStorage.getItem(MOTION_STORAGE_KEY)).toBe('full')
    expect(document.documentElement.dataset.motion).toBe('full')
  })
})
