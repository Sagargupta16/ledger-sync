import { beforeEach, describe, expect, it } from 'vitest'

/**
 * `BRUSH_DEFAULTS` carries baked color strings, because Recharts passes them
 * straight through as SVG presentation attributes and those cannot hold
 * `var()`. Baked strings resolve ONCE at module load, so without a refresh hook
 * the brush keeps whatever theme was active on first paint: toggle to light and
 * the selection window and hairline stay dark-theme values.
 *
 * This is the chart-theme-reactivity bug class that already hit the derived
 * `CHART_*` constants. The fix is mutation in place (never reassignment), since
 * every consumer spreads `{...BRUSH_DEFAULTS}` from an identity it captured at
 * import time -- so these tests pin BOTH that values track the theme and that
 * the object identity survives.
 */

const { BRUSH_DEFAULTS } = await import('../chartDefaults')
const { rawColors, refreshRawColors } = await import('@/constants/colors')

describe('BRUSH_DEFAULTS theme reactivity', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('derives the selection fill from the blue token, not a baked literal', () => {
    // Not asserting an exact rgba string: the point is that it is a *derivation*
    // of the live token, which the next test proves by changing the token.
    expect(BRUSH_DEFAULTS.fill).toContain('rgba(')
    expect(BRUSH_DEFAULTS.fillOpacity).toBe(1)
  })

  it('picks up a new token value on refresh', () => {
    const before = BRUSH_DEFAULTS.fill

    // Override the CSS custom property the token reads, then drive the same
    // refresh that a theme toggle triggers (lib/theme.ts applyTheme).
    document.documentElement.style.setProperty('--color-app-blue', '#010203')
    refreshRawColors()

    expect(rawColors.app.blue).toBe('#010203')
    expect(BRUSH_DEFAULTS.fill).toBe('rgba(1, 2, 3, 0.12)')
    expect(BRUSH_DEFAULTS.fill).not.toBe(before)
  })

  it('keeps its object identity across a refresh, so spread consumers see the update', () => {
    const captured = BRUSH_DEFAULTS // what a module gets at import time

    document.documentElement.style.setProperty('--color-app-blue', '#0a0b0c')
    refreshRawColors()

    // Reassignment instead of Object.assign would leave `captured` stale here.
    expect(captured).toBe(BRUSH_DEFAULTS)
    expect(captured.fill).toBe('rgba(10, 11, 12, 0.12)')
  })

  it('keeps the non-color settings intact through a refresh', () => {
    document.documentElement.style.setProperty('--color-app-blue', '#111213')
    refreshRawColors()

    // The 34px height is the touch-target affordance; a refresh must not drop it.
    expect(BRUSH_DEFAULTS.height).toBe(34)
    expect(BRUSH_DEFAULTS.travellerWidth).toBe(16)
    expect(typeof BRUSH_DEFAULTS.traveller).toBe('function')
  })
})
