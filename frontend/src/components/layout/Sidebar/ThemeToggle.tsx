import { Sun, Moon } from 'lucide-react'

import { useThemeStore } from '@/store/themeStore'
import type { ThemeMode } from '@/lib/theme'

/**
 * Quick theme toggle for the sidebar utility bar: light <-> dark.
 * Shows the icon for the current mode. Reads/writes the shared themeStore.
 * (New users start on their OS preference; the toggle stores an explicit choice.)
 */
const NEXT: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'light' }
const ICON = { light: Sun, dark: Moon }
const LABEL = { light: 'Light', dark: 'Dark' }

export default function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const Icon = ICON[mode]

  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      className="flex size-11 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-hover hover:text-foreground lg:size-9"
      title={`Theme: ${LABEL[mode]} (tap to switch to ${LABEL[NEXT[mode]]})`}
      aria-label={`Theme: ${LABEL[mode]}. Tap to switch to ${LABEL[NEXT[mode]]}.`}
    >
      <Icon size={18} />
    </button>
  )
}
