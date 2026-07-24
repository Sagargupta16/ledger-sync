/**
 * Shared UI primitives for the Settings page sections.
 */

import { useId, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { sectionVariants } from './styles'

// ---------------------------------------------------------------------------
// Collapsible Section wrapper
// ---------------------------------------------------------------------------

export function Section({
  index,
  icon: Icon,
  title,
  description,
  children,
  defaultCollapsed = true,
}: Readonly<{
  index: number
  icon: React.ElementType
  title: string
  description?: string
  children: React.ReactNode
  /**
   * Whether the section is collapsed on first render. Defaults to true so the
   * Settings page opens as a scannable list of headers, not a wall of open
   * forms. Pass `false` for a section that needs to be immediately visible
   * (e.g. a hero or empty-state prompt).
   */
  defaultCollapsed?: boolean
}>) {
  const [expanded, setExpanded] = useState(!defaultCollapsed)
  const panelId = useId()

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      className="glass rounded-2xl border border-border overflow-hidden"
    >
      <button
        id={`${panelId}-trigger`}
        type="button"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex items-center gap-3 w-full px-6 py-5 text-left hover:bg-[var(--overlay-2)] transition-colors"
      >
        <div className="p-2 rounded-xl bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={`${panelId}-trigger`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="overflow-hidden"
          >
            <div className="px-6 pb-6 space-y-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

// ---------------------------------------------------------------------------
// Group heading
// ---------------------------------------------------------------------------

/**
 * Lightweight label above a cluster of related sections. Gives the Settings
 * page information scent so the 11 sections read as a few task-based groups
 * instead of one flat list. Matches the overline group-header style used on
 * the More page.
 */
export function GroupHeader({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <h2 className="text-overline uppercase tracking-wider text-text-tertiary font-semibold px-1 pt-2 first:pt-0">
      {children}
    </h2>
  )
}

// ---------------------------------------------------------------------------
// Toggle switch
// ---------------------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  id,
  'aria-label': ariaLabel,
}: Readonly<{
  checked: boolean
  onChange: (val: boolean) => void
  id: string
  'aria-label': string
}>) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={() => onChange(!checked)}
      // Track stays 24x44px visually; a ::before pseudo expands the tap target
      // to the 44px min on touch without changing the switch's proportions.
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors before:absolute before:left-1/2 before:top-1/2 before:h-11 before:w-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
        checked ? 'bg-primary' : 'bg-[var(--overlay-6)]'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-foreground shadow-lg transition-transform ${
          checked ? 'translate-x-5' : 'translate-x-0'
        }`}
      />
    </button>
  )
}

// ---------------------------------------------------------------------------
// Form field helpers
// ---------------------------------------------------------------------------

export function FieldLabel({
  htmlFor,
  children,
}: Readonly<{ htmlFor: string; children: React.ReactNode }>) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1.5">
      {children}
    </label>
  )
}

export function FieldLegend({ children }: Readonly<{ children: React.ReactNode }>) {
  return <span className="block text-sm font-medium text-foreground mb-1.5">{children}</span>
}

export function FieldHint({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>
}
