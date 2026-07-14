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
      className="flex size-11 items-center justify-center rounded-md text-text-tertiary transition-colors duration-150 hover:bg-surface-hover hover:text-foreground lg:size-9"
      title={`Theme: ${LABEL[mode]} (tap to change)`}
      aria-label={`Theme: ${LABEL[mode]}. Tap to switch to ${LABEL[NEXT[mode]]}.`}
    >
      <Icon size={18} />
    </button>
  )
}
