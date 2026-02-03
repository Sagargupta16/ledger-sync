/**
 * Centralized iOS Color Palette
 * 
 * All colors are defined as CSS variables in index.css under @theme.
 * This file provides TypeScript constants for accessing them in JS/TSX.
 * 
 * Usage in components:
 * - For Tailwind classes: Use `text-ios-blue`, `bg-ios-green/20`, etc.
 * - For inline styles: Use `colors.ios.blue` or `cssVar('--color-ios-blue')`
 */

// Helper to reference CSS variables
export const cssVar = (variable: string) => `var(${variable})`

// iOS Color Palette - maps to CSS variables
export const colors = {
  // Primary iOS colors (softened for dark mode)
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

  // Semantic colors
  semantic: {
    success: cssVar('--color-success'),
    warning: cssVar('--color-warning'),
    error: cssVar('--color-error'),
    info: cssVar('--color-info'),
  },

  // Text colors
  text: {
    primary: cssVar('--color-text-primary'),
    secondary: cssVar('--color-text-secondary'),
    tertiary: cssVar('--color-text-tertiary'),
    quaternary: cssVar('--color-text-quaternary'),
  },

  // UI colors
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

// Raw hex values for cases where CSS variables can't be used (e.g., gradients in canvas)
export const rawColors = {
  ios: {
    blue: '#5aa3ff',
    blueVibrant: '#0a84ff',
    green: '#34c759',
    greenVibrant: '#30d158',
    red: '#ff6b6b',
    redVibrant: '#ff453a',
    orange: '#ff9f43',
    orangeVibrant: '#ff9f0a',
    yellow: '#ffd93d',
    yellowVibrant: '#ffd426',
    teal: '#5ac8f5',
    tealVibrant: '#64d2ff',
    purple: '#a78bfa',
    purpleVibrant: '#bf5af2',
    pink: '#ff8fab',
    pinkVibrant: '#ff375f',
    indigo: '#818cf8',
    indigoVibrant: '#5e5ce6',
  },
  text: {
    primary: '#f5f5f7',
    secondary: '#8e8e93',
    tertiary: '#636366',
    quaternary: '#48484a',
  },
} as const

// Color config for MetricCard and similar components
export const metricColorConfig = {
  green: {
    bg: 'rgba(52, 199, 89, 0.12)',
    text: rawColors.ios.green,
    glow: 'rgba(52, 199, 89, 0.15)',
    className: 'text-ios-green',
  },
  red: {
    bg: 'rgba(255, 107, 107, 0.12)',
    text: rawColors.ios.red,
    glow: 'rgba(255, 107, 107, 0.15)',
    className: 'text-ios-red',
  },
  blue: {
    bg: 'rgba(90, 163, 255, 0.12)',
    text: rawColors.ios.blue,
    glow: 'rgba(90, 163, 255, 0.15)',
    className: 'text-ios-blue',
  },
  purple: {
    bg: 'rgba(167, 139, 250, 0.12)',
    text: rawColors.ios.purple,
    glow: 'rgba(167, 139, 250, 0.15)',
    className: 'text-ios-purple',
  },
  yellow: {
    bg: 'rgba(255, 217, 61, 0.12)',
    text: '#e5c100', // Slightly darker for readability
    glow: 'rgba(255, 217, 61, 0.15)',
    className: 'text-ios-yellow',
  },
  teal: {
    bg: 'rgba(90, 200, 245, 0.12)',
    text: rawColors.ios.teal,
    glow: 'rgba(90, 200, 245, 0.15)',
    className: 'text-ios-teal',
  },
  orange: {
    bg: 'rgba(255, 159, 67, 0.12)',
    text: '#e89b00', // Slightly darker for readability
    glow: 'rgba(255, 159, 67, 0.15)',
    className: 'text-ios-orange',
  },
  indigo: {
    bg: 'rgba(129, 140, 248, 0.12)',
    text: rawColors.ios.indigo,
    glow: 'rgba(129, 140, 248, 0.15)',
    className: 'text-ios-indigo',
  },
} as const

export type MetricColor = keyof typeof metricColorConfig
