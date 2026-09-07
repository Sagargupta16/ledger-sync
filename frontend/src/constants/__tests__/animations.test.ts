import { describe, expect, it } from 'vitest'

import { DISCLOSURE_TRANSITION, ROUTE_TRANSITION } from '../animations'

describe('shared motion contracts', () => {
  it('uses layout projection without animating disclosure height', () => {
    expect(DISCLOSURE_TRANSITION.layout).toBe('position')
    expect(DISCLOSURE_TRANSITION.initial).not.toHaveProperty('height')
    expect(DISCLOSURE_TRANSITION.animate).not.toHaveProperty('height')
    expect(DISCLOSURE_TRANSITION.exit).not.toHaveProperty('height')
    expect(DISCLOSURE_TRANSITION.transition.layout.duration).toBeGreaterThan(0)
  })

  it('keeps route navigation motion within 300ms with a shorter ease-in exit', () => {
    const enter = ROUTE_TRANSITION.animate.transition
    const exit = ROUTE_TRANSITION.exit.transition

    expect(exit.duration).toBeLessThan(enter.duration)
    expect(exit.ease).toBe('easeIn')
    expect(enter.duration + exit.duration).toBeLessThanOrEqual(0.3)
  })
})
