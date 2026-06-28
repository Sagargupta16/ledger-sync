import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react'

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

  return (
    <div className={`rounded-xl border ${toneBorder} ${toneBg} p-4`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between"
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
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={`Type ${confirmKeyword} to confirm`}
                className={`w-full px-3 py-1.5 bg-[var(--overlay-2)] border border-[var(--hairline-2)] rounded-lg text-foreground text-sm ${inputBorderFocus} focus:outline-none transition-colors duration-150 ease-out`}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={actionButton.onClick}
                  disabled={confirmText !== confirmKeyword || actionButton.pending}
                  className={`flex items-center gap-2 px-3 py-1.5 ${actionButton.bgClass} text-foreground text-sm rounded-lg transition-colors duration-150 ease-out disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  {actionButton.pending ? actionButton.pendingLabel : actionButton.label}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setExpanded(false)
                    setConfirmText('')
                  }}
                  className="px-3 py-1.5 bg-[var(--overlay-3)] border border-[var(--hairline-2)] text-foreground text-sm rounded-lg hover:bg-[var(--overlay-5)] transition-colors duration-150 ease-out"
                >
                  Cancel
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
