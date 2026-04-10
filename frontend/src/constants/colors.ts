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
function hexToRgba(hex: string, alpha: number): string {
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
    green:  mc(rawColors.app.green,  'text-app-green'),
    red:    mc(rawColors.app.red,    'text-app-red'),
    blue:   mc(rawColors.app.blue,   'text-app-blue'),
    purple: mc(rawColors.app.purple, 'text-app-purple'),
    yellow: mc(rawColors.app.yellow, 'text-app-yellow'),
    teal:   mc(rawColors.app.teal,   'text-app-teal'),
    orange: mc(rawColors.app.orange, 'text-app-orange'),
    indigo: mc(rawColors.app.indigo, 'text-app-indigo'),
  } as const
}

export const metricColorConfig = buildMetricColorConfig()

export type MetricColor = keyof typeof metricColorConfig
