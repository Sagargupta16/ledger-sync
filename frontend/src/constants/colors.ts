/**
 * Centralized App Color Palette
 *
 * Single source of truth: CSS variables in index.css.
 * This file reads computed values at runtime so JS/Recharts/SVG always
 * match whatever is defined in CSS — change index.css and everything updates.
 *
 * Usage in components:
 * - Tailwind classes: `text-app-blue`, `bg-app-green/20`, etc.
 * - Inline styles:   `colors.app.blue` (returns `var(--color-app-blue)`)
 * - Recharts/SVG:    `rawColors.app.blue` (returns resolved hex like `#4a9eff`)
 */

// Helper to reference CSS variables (for inline style props)
export const cssVar = (variable: string) => `var(${variable})`

/**
 * Read a CSS custom property's computed hex value from :root.
 * Falls back to the provided default if DOM isn't available (SSR).
 */
function resolveColor(varName: string, fallback: string): string {
  if (typeof document === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(varName).trim()
  return value || fallback
}

/**
 * Convert a resolved hex color to an rgba string at a given opacity.
 * Handles both #RRGGBB and #RGB formats.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '')
  const r = Number.parseInt(cleaned.length === 3 ? cleaned[0] + cleaned[0] : cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.length === 3 ? cleaned[1] + cleaned[1] : cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.length === 3 ? cleaned[2] + cleaned[2] : cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ─── CSS var() references (for React inline styles) ──────────────────────────

export const colors = {
  app: {
    blue: cssVar('--color-app-blue'),
    blueVibrant: cssVar('--color-app-blue-vibrant'),
    green: cssVar('--color-app-green'),
    greenVibrant: cssVar('--color-app-green-vibrant'),
    red: cssVar('--color-app-red'),
    redVibrant: cssVar('--color-app-red-vibrant'),
    orange: cssVar('--color-app-orange'),
    orangeVibrant: cssVar('--color-app-orange-vibrant'),
    yellow: cssVar('--color-app-yellow'),
    yellowVibrant: cssVar('--color-app-yellow-vibrant'),
    teal: cssVar('--color-app-teal'),
    tealVibrant: cssVar('--color-app-teal-vibrant'),
    purple: cssVar('--color-app-purple'),
    purpleVibrant: cssVar('--color-app-purple-vibrant'),
    pink: cssVar('--color-app-pink'),
    pinkVibrant: cssVar('--color-app-pink-vibrant'),
    indigo: cssVar('--color-app-indigo'),
    indigoVibrant: cssVar('--color-app-indigo-vibrant'),
  },
  semantic: {
    success: cssVar('--color-success'),
    warning: cssVar('--color-warning'),
    error: cssVar('--color-error'),
    info: cssVar('--color-info'),
  },
  financial: {
    income: cssVar('--color-income'),
    expense: cssVar('--color-expense'),
    savings: cssVar('--color-savings'),
    transfer: cssVar('--color-transfer'),
    investment: cssVar('--color-investment'),
  },
  text: {
    primary: cssVar('--color-text-primary'),
    secondary: cssVar('--color-text-secondary'),
    tertiary: cssVar('--color-text-tertiary'),
    quaternary: cssVar('--color-text-quaternary'),
  },
  ui: {
    background: cssVar('--color-background'),
    foreground: cssVar('--color-foreground'),
    card: cssVar('--color-card'),
    cardForeground: cssVar('--color-card-foreground'),
    border: cssVar('--color-border'),
    borderStrong: cssVar('--color-border-strong'),
    muted: cssVar('--color-muted'),
    mutedForeground: cssVar('--color-muted-foreground'),
  },
} as const

// ─── Resolved hex values (for Recharts, SVG, canvas — reads from CSS at runtime) ─

/** Call once after DOM is ready (e.g. in a top-level useEffect or module scope). */
function buildRawColors() {
  const r = (v: string, fb: string) => resolveColor(v, fb)
  return {
    app: {
      blue:           r('--color-app-blue',           '#4a9eff'),
      blueVibrant:    r('--color-app-blue-vibrant',   '#0a84ff'),
      green:          r('--color-app-green',           '#30d158'),
      greenVibrant:   r('--color-app-green-vibrant',  '#28cd50'),
      red:            r('--color-app-red',             '#ff5757'),
      redVibrant:     r('--color-app-red-vibrant',    '#ff453a'),
      orange:         r('--color-app-orange',          '#ff9f0a'),
      orangeVibrant:  r('--color-app-orange-vibrant', '#ff9500'),
      yellow:         r('--color-app-yellow',          '#ffd93d'),
      yellowVibrant:  r('--color-app-yellow-vibrant', '#ffd426'),
      teal:           r('--color-app-teal',            '#5ac8f5'),
      tealVibrant:    r('--color-app-teal-vibrant',   '#64d2ff'),
      purple:         r('--color-app-purple',          '#a78bfa'),
      purpleVibrant:  r('--color-app-purple-vibrant', '#bf5af2'),
      pink:           r('--color-app-pink',            '#ff8fab'),
      pinkVibrant:    r('--color-app-pink-vibrant',   '#ff375f'),
      indigo:         r('--color-app-indigo',          '#818cf8'),
      indigoVibrant:  r('--color-app-indigo-vibrant', '#5e5ce6'),
    },
    financial: {
      income:     r('--color-income',     '#30d158'),
      expense:    r('--color-expense',    '#ff5757'),
      savings:    r('--color-savings',    '#a78bfa'),
      transfer:   r('--color-transfer',   '#5ac8f5'),
      investment: r('--color-investment', '#4a9eff'),
    },
    text: {
      primary:    r('--color-text-primary',    '#f5f5f7'),
      secondary:  r('--color-text-secondary',  '#8e8e93'),
      tertiary:   r('--color-text-tertiary',   '#7c7c80'),
      quaternary: r('--color-text-quaternary', '#48484a'),
    },
    // Foreground for accent-colored surfaces (blue/green pill fills, primary
    // buttons). Kept as a dedicated token so it stays white even in light
    // theme -- the accent background is bright enough that white text has
    // AA contrast in both themes.
    onAccent: r('--color-on-accent', '#ffffff'),
    // Chart-only neutrals/surfaces. CSS var() can't be used in SVG presentation
    // attributes, so these resolve the --chart-* tokens to concrete strings for
    // Recharts. Fallbacks are the historical dark values so SSR/no-DOM is safe.
    chart: {
      textPrimary:         r('--chart-text-primary',         '#fafafa'),
      textSecondary:       r('--chart-text-secondary',       '#f5f5f7'),
      textMuted:           r('--chart-text-muted',           '#a1a1aa'),
      textSubtle:          r('--chart-text-subtle',          '#71717a'),
      textDim:             r('--chart-text-dim',             '#52525b'),
      axisColor:           r('--chart-axis-color',           '#9ca3af'),
      grid:                r('--chart-grid',                 'rgba(255, 255, 255, 0.04)'),
      axisLine:            r('--chart-axis-line',            'rgba(255, 255, 255, 0.06)'),
      cursor:              r('--chart-cursor',               'rgba(255, 255, 255, 0.06)'),
      referenceLine:       r('--chart-reference-line',       'rgba(255, 255, 255, 0.15)'),
      referenceLineStrong: r('--chart-reference-line-strong', 'rgba(255, 255, 255, 0.2)'),
      activeStroke:        r('--chart-active-stroke',        'rgba(255, 255, 255, 0.3)'),
      svgStroke:           r('--chart-svg-stroke',           'rgba(255, 255, 255, 0.08)'),
      tooltipBg:           r('--chart-tooltip-bg',           'rgba(26, 26, 28, 0.95)'),
      tooltipBorder:       r('--chart-tooltip-border',       'rgba(255, 255, 255, 0.08)'),
      gridSolid:           r('--chart-grid-solid',           '#2a2a2e'),
      neutral:             r('--chart-neutral',              '#9ca3af'),
      muted:               r('--chart-muted',                '#6b7280'),
      inputBg:             r('--chart-input-bg',             'rgba(44, 44, 46, 0.6)'),
      inputBorder:         r('--chart-input-border',         'rgba(58, 58, 60, 0.6)'),
    },
  }
}

// Resolved once at module load (DOM is ready by the time React renders)
export const rawColors = buildRawColors()

/**
 * Subscribers notified after `rawColors` is rebuilt. chartColors.ts registers
 * one to re-sync its derived `CHART_*` constants. Kept as a registry (rather
 * than importing chartColors here) so the dependency only flows one way:
 * chartColors imports colors, never the reverse.
 */
const rawColorsListeners = new Set<() => void>()

/** Register a callback to run after each `refreshRawColors()`. */
export function onRawColorsRefresh(listener: () => void): void {
  rawColorsListeners.add(listener)
}

/**
 * Rebuild the resolved color values IN PLACE on the existing `rawColors`
 * object, preserving its identity so modules that imported `rawColors` (and the
 * derived `CHART_*` constants in chartColors.ts) keep their reference and just
 * see fresh values. Call after a theme toggle (see lib/theme.ts applyTheme) so
 * Recharts repaints with the active theme's chart colors.
 */
export function refreshRawColors(): void {
  const next = buildRawColors()
  Object.assign(rawColors.app, next.app)
  Object.assign(rawColors.financial, next.financial)
  Object.assign(rawColors.text, next.text)
  Object.assign(rawColors.chart, next.chart)
  for (const listener of rawColorsListeners) listener()
}

// ─── MetricCard color configs (derived from rawColors) ───────────────────────

interface MetricColorEntry {
  bg: string
  text: string
  glow: string
  className: string
}

function buildMetricColorConfig() {
  const mc = (color: string, twClass: string): MetricColorEntry => ({
    bg: hexToRgba(color, 0.12),
    text: color,
    glow: hexToRgba(color, 0.15),
    className: twClass,
  })
  return {
    green:  mc(rawColors.app.green,  'text-app-green'),
    red:    mc(rawColors.app.red,    'text-app-red'),
    blue:   mc(rawColors.app.blue,   'text-app-blue'),
    purple: mc(rawColors.app.purple, 'text-app-purple'),
    yellow: mc(rawColors.app.yellow, 'text-app-yellow'),
    teal:   mc(rawColors.app.teal,   'text-app-teal'),
    orange: mc(rawColors.app.orange, 'text-app-orange'),
    indigo: mc(rawColors.app.indigo, 'text-app-indigo'),
  }
}

// Mutated in place on theme toggle so MetricCard's inline-style tint/glow/icon
// colors (baked rgba strings, not var()-backed) track the active theme. Kept as
// a stable object identity for importers; refreshed via onRawColorsRefresh below.
export const metricColorConfig = buildMetricColorConfig()

export type MetricColor = keyof typeof metricColorConfig

// Rebuild the derived metric tints after rawColors is re-resolved on a toggle.
onRawColorsRefresh(() => Object.assign(metricColorConfig, buildMetricColorConfig()))
