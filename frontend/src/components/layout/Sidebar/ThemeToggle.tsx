import { Sun, Moon } from 'lucide-react'

import { Button } from '@/components/ui'
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
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setMode(NEXT[mode])}
      className="size-11 p-0 text-text-tertiary hover:bg-surface-hover lg:size-9 lg:min-h-9 lg:min-w-9"
      title={`Theme: ${LABEL[mode]} (tap to switch to ${LABEL[NEXT[mode]]})`}
      aria-label={`Theme: ${LABEL[mode]}. Tap to switch to ${LABEL[NEXT[mode]]}.`}
    >
      <Icon size={18} aria-hidden="true" />
    </Button>
  )
}
