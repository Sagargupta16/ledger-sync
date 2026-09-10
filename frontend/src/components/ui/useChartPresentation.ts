import { CHART_ANIMATION_THRESHOLD } from '@/constants'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useMotionStore } from '@/store/motionStore'
import { useThemeStore } from '@/store/themeStore'

/** Subscribe at the chart level so SVG paint and animation follow live settings. */
export function useChartPresentation(dataLength: number) {
  const isMobile = useIsMobile()
  const reduced = useMotionStore((state) => state.mode === 'reduced')
  const theme = useThemeStore((state) => state.resolved)

  return {
    animate: !reduced && dataLength < CHART_ANIMATION_THRESHOLD,
    isMobile,
    theme,
  }
}
