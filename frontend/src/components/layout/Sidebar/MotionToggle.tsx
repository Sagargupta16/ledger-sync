import { Accessibility, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui'
import { useMotionStore, type MotionMode } from '@/store/motionStore'

const NEXT: Record<MotionMode, MotionMode> = {
  full: 'reduced',
  reduced: 'full',
}

const LABEL: Record<MotionMode, string> = {
  full: 'Full',
  reduced: 'Reduced',
}

export default function MotionToggle() {
  const mode = useMotionStore((state) => state.mode)
  const setMode = useMotionStore((state) => state.setMode)
  const nextMode = NEXT[mode]
  const Icon = mode === 'full' ? Sparkles : Accessibility

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={() => setMode(nextMode)}
      className="size-11 p-0 text-text-tertiary hover:bg-surface-hover lg:size-9 lg:min-h-9 lg:min-w-9"
      title={`Motion: ${LABEL[mode]} (tap to switch to ${LABEL[nextMode]})`}
      aria-label={`Motion: ${LABEL[mode]}. Tap to switch to ${LABEL[nextMode]}.`}
    >
      <Icon
        size={18}
        aria-hidden="true"
        className={mode === 'full' ? 'motion-toggle-icon' : undefined}
      />
    </Button>
  )
}
