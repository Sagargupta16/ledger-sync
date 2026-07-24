import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'
import { Button, Input } from '@/components/ui'

interface DangerActionRowProps {
  expanded: boolean
  setExpanded: (v: boolean) => void
  Icon: LucideIcon
  title: string
  toneText: string
  toneBorder: string
  toneBg: string
  description: string
  confirmKeyword: string
  confirmKeywordBg: string
  confirmText: string
  setConfirmText: (v: string) => void
  inputBorderFocus: string
  actionButton: {
    label: string
    pendingLabel: string
    bgClass: string
    onClick: () => void
    pending: boolean
  }
}

export function DangerActionRow(props: Readonly<DangerActionRowProps>) {
  const {
    expanded,
    setExpanded,
    Icon,
    title,
    toneText,
    toneBorder,
    toneBg,
    description,
    confirmKeyword,
    confirmKeywordBg,
    confirmText,
    setConfirmText,
    inputBorderFocus,
    actionButton,
  } = props
  const panelId = `profile-action-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, '-')}`

  return (
    <div className={`rounded-xl border ${toneBorder} ${toneBg} p-4`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex min-h-11 w-full items-center justify-between"
        aria-expanded={expanded}
        aria-controls={panelId}
      >
        <div className="flex items-center gap-2">
          <Icon size={14} className={toneText} />
          <span className={`text-sm font-medium ${toneText}`}>{title}</span>
        </div>
        {expanded ? (
          <ChevronUp size={14} className={toneText} />
        ) : (
          <ChevronDown size={14} className={toneText} />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-3 space-y-3">
              <p className="text-xs text-muted-foreground">{description}</p>
              <p className={`${toneText} text-xs font-medium`}>
                Type{' '}
                <span className={`font-mono ${confirmKeywordBg} px-1 rounded`}>
                  {confirmKeyword}
                </span>{' '}
                to confirm:
              </p>
              <Input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={`Type ${confirmKeyword} to confirm`}
                aria-label={`Confirmation text for ${title}`}
                className={inputBorderFocus}
              />
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  onClick={actionButton.onClick}
                  disabled={confirmText !== confirmKeyword || actionButton.pending}
                  className={`${actionButton.bgClass} text-foreground`}
                >
                  {actionButton.pending ? actionButton.pendingLabel : actionButton.label}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setExpanded(false)
                    setConfirmText('')
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
