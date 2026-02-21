/**
 * Centralized iOS Color Palette
 *
 * Single source of truth: CSS variables in index.css.
 * This file reads computed values at runtime so JS/Recharts/SVG always
 * match whatever is defined in CSS — change index.css and everything updates.
 *
 * Usage in components:
 * - Tailwind classes: `text-ios-blue`, `bg-ios-green/20`, etc.
 * - Inline styles:   `colors.ios.blue` (returns `var(--color-ios-blue)`)
 * - Recharts/SVG:    `rawColors.ios.blue` (returns resolved hex like `#4a9eff`)
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
function hexToRgba(hex: string, alpha: number): string {
  const cleaned = hex.replace('#', '')
  const r = Number.parseInt(cleaned.length === 3 ? cleaned[0] + cleaned[0] : cleaned.slice(0, 2), 16)
  const g = Number.parseInt(cleaned.length === 3 ? cleaned[1] + cleaned[1] : cleaned.slice(2, 4), 16)
  const b = Number.parseInt(cleaned.length === 3 ? cleaned[2] + cleaned[2] : cleaned.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ─── CSS var() references (for React inline styles) ──────────────────────────

export const colors = {
  ios: {
    blue: cssVar('--color-ios-blue'),
    blueVibrant: cssVar('--color-ios-blue-vibrant'),
    green: cssVar('--color-ios-green'),
    greenVibrant: cssVar('--color-ios-green-vibrant'),
    red: cssVar('--color-ios-red'),
    redVibrant: cssVar('--color-ios-red-vibrant'),
    orange: cssVar('--color-ios-orange'),
    orangeVibrant: cssVar('--color-ios-orange-vibrant'),
    yellow: cssVar('--color-ios-yellow'),
    yellowVibrant: cssVar('--color-ios-yellow-vibrant'),
    teal: cssVar('--color-ios-teal'),
    tealVibrant: cssVar('--color-ios-teal-vibrant'),
    purple: cssVar('--color-ios-purple'),
    purpleVibrant: cssVar('--color-ios-purple-vibrant'),
    pink: cssVar('--color-ios-pink'),
    pinkVibrant: cssVar('--color-ios-pink-vibrant'),
    indigo: cssVar('--color-ios-indigo'),
    indigoVibrant: cssVar('--color-ios-indigo-vibrant'),
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
    ios: {
      blue:           r('--color-ios-blue',           '#4a9eff'),
      blueVibrant:    r('--color-ios-blue-vibrant',   '#0a84ff'),
      green:          r('--color-ios-green',           '#30d158'),
      greenVibrant:   r('--color-ios-green-vibrant',  '#28cd50'),
      red:            r('--color-ios-red',             '#ff5757'),
      redVibrant:     r('--color-ios-red-vibrant',    '#ff453a'),
      orange:         r('--color-ios-orange',          '#ff9f0a'),
      orangeVibrant:  r('--color-ios-orange-vibrant', '#ff9500'),
      yellow:         r('--color-ios-yellow',          '#ffd93d'),
      yellowVibrant:  r('--color-ios-yellow-vibrant', '#ffd426'),
      teal:           r('--color-ios-teal',            '#5ac8f5'),
      tealVibrant:    r('--color-ios-teal-vibrant',   '#64d2ff'),
      purple:         r('--color-ios-purple',          '#a78bfa'),
      purpleVibrant:  r('--color-ios-purple-vibrant', '#bf5af2'),
      pink:           r('--color-ios-pink',            '#ff8fab'),
      pinkVibrant:    r('--color-ios-pink-vibrant',   '#ff375f'),
      indigo:         r('--color-ios-indigo',          '#818cf8'),
      indigoVibrant:  r('--color-ios-indigo-vibrant', '#5e5ce6'),
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
      tertiary:   r('--color-text-tertiary',   '#636366'),
      quaternary: r('--color-text-quaternary', '#48484a'),
    },
  }
}

// Resolved once at module load (DOM is ready by the time React renders)
export const rawColors = buildRawColors()

// ─── MetricCard color configs (derived from rawColors) ───────────────────────

function buildMetricColorConfig() {
  const mc = (color: string, twClass: string) => ({
    bg: hexToRgba(color, 0.12),
    text: color,
    glow: hexToRgba(color, 0.15),
    className: twClass,
  })
  return {
    green:  mc(rawColors.ios.green,  'text-ios-green'),
    red:    mc(rawColors.ios.red,    'text-ios-red'),
    blue:   mc(rawColors.ios.blue,   'text-ios-blue'),
    purple: mc(rawColors.ios.purple, 'text-ios-purple'),
    yellow: mc(rawColors.ios.yellow, 'text-ios-yellow'),
    teal:   mc(rawColors.ios.teal,   'text-ios-teal'),
    orange: mc(rawColors.ios.orange, 'text-ios-orange'),
    indigo: mc(rawColors.ios.indigo, 'text-ios-indigo'),
  } as const
}

export const metricColorConfig = buildMetricColorConfig()

export type MetricColor = keyof typeof metricColorConfig
