import { motion } from 'motion/react'
import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Button, Input } from '@/components/ui'
import { DURATION, EASING } from '@/constants/animations'
import { useMotionStore } from '@/store/motionStore'

interface DangerActionRowProps {
  expanded: boolean
  setExpanded: (v: boolean) => void
  disabled?: boolean
  Icon: LucideIcon
  title: string
  summary: string
  description: string
  confirmKeyword: string
  confirmText: string
  setConfirmText: (v: string) => void
  actionButton: {
    label: string
    pendingLabel: string
    onClick: () => void
    pending: boolean
  }
}

export function DangerActionRow(props: Readonly<DangerActionRowProps>) {
  const {
    expanded,
    setExpanded,
    disabled,
    Icon,
    title,
    summary,
    description,
    confirmKeyword,
    confirmText,
    setConfirmText,
    actionButton,
  } = props
  const panelId = `profile-action-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')

  return (
    <div className="py-1">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        disabled={disabled}
        className="flex min-h-11 w-full items-center gap-3 rounded-md py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] disabled:opacity-50"
        aria-expanded={expanded}
        aria-controls={expanded ? panelId : undefined}
        aria-labelledby={`${panelId}-title`}
        aria-describedby={`${panelId}-summary`}
      >
        <Icon className="size-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span id={`${panelId}-title`} className="block text-sm font-medium">{title}</span>
          <span id={`${panelId}-summary`} className="mt-0.5 block text-xs leading-5 text-muted-foreground">{summary}</span>
        </span>
        <ChevronDown className={`size-4 shrink-0 text-text-tertiary ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>

      {expanded && (
        <motion.div
          id={panelId}
          initial={reduceMotion ? false : { opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduceMotion ? 0 : DURATION.quick, ease: EASING.cinematic }}
          className="mb-3 rounded-md border border-app-red/20 bg-app-red/5 p-3 sm:p-4"
        >
          <form className="space-y-3" onSubmit={(event) => {
            event.preventDefault()
            if (confirmText === confirmKeyword && !disabled && !actionButton.pending) actionButton.onClick()
          }}>
            <p id={`${panelId}-description`} className="text-xs leading-5 text-muted-foreground">{description}</p>
            <Input
              id={`${panelId}-confirmation`}
              label={`Type ${confirmKeyword} to confirm`}
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`Type ${confirmKeyword} to confirm`}
              aria-label={`Confirmation text for ${title}`}
              aria-describedby={`${panelId}-description`}
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="submit"
                variant="danger"
                size="sm"
                disabled={confirmText !== confirmKeyword || disabled}
                isLoading={actionButton.pending}
              >
                {actionButton.pending ? actionButton.pendingLabel : actionButton.label}
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled}
                onClick={() => {
                  setExpanded(false)
                  setConfirmText('')
                }}
              >
                Cancel
              </Button>
            </div>
          </form>
        </motion.div>
      )}
    </div>
  )
}
