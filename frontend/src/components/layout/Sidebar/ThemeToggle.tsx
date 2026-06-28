import { Sun, Moon, Monitor } from 'lucide-react'

import { useThemeStore } from '@/store/themeStore'
import type { ThemeMode } from '@/lib/theme'

/**
 * Quick theme cycler for the sidebar utility bar: light -> dark -> system.
 * Shows the icon for the current mode; full Light/Dark/System control lives
 * in Settings > Display. Reads/writes the shared themeStore.
 */
const NEXT: Record<ThemeMode, ThemeMode> = { light: 'dark', dark: 'system', system: 'light' }
const ICON = { light: Sun, dark: Moon, system: Monitor }
const LABEL = { light: 'Light', dark: 'Dark', system: 'System' }

export default function ThemeToggle() {
  const mode = useThemeStore((s) => s.mode)
  const setMode = useThemeStore((s) => s.setMode)
  const Icon = ICON[mode]

  return (
    <button
      type="button"
      onClick={() => setMode(NEXT[mode])}
      className="w-11 h-11 lg:w-9 lg:h-9 flex items-center justify-center rounded-lg text-text-tertiary hover:text-foreground hover:bg-surface-hover transition-colors duration-150"
      title={`Theme: ${LABEL[mode]} (tap to change)`}
      aria-label={`Theme: ${LABEL[mode]}. Tap to switch to ${LABEL[NEXT[mode]]}.`}
    >
      <Icon size={18} />
    </button>
  )
}
