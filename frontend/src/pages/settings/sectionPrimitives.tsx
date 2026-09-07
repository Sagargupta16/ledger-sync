/**
 * Shared UI primitives for the Settings page sections.
 */

import { useId, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { ChevronDown } from 'lucide-react'
import { DISCLOSURE_TRANSITION } from '@/constants/animations'
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
      layout="position"
      custom={index}
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      className="ledger-panel relative overflow-hidden"
    >
      <button
        id={`${panelId}-trigger`}
        type="button"
        onClick={() => setExpanded((p) => !p)}
        aria-expanded={expanded}
        aria-controls={panelId}
        className="flex min-h-16 w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-[var(--overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus-ring)] sm:px-5"
      >
        <div className="rounded-md bg-primary/10 p-2">
          <Icon className="size-5 text-primary" aria-hidden="true" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-foreground">{title}</h3>
          {description && (
            <p className="mt-0.5 text-xs leading-5 text-muted-foreground sm:truncate sm:leading-normal">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform duration-200 ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      <AnimatePresence initial={false} mode="popLayout">
        {expanded && (
          <motion.div
            id={panelId}
            role="region"
            aria-labelledby={`${panelId}-trigger`}
            {...DISCLOSURE_TRANSITION}
            className="overflow-hidden"
          >
            <div className="space-y-4 px-4 pb-4 sm:px-5 sm:pb-5">{children}</div>
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
    <h2 className="px-1 pt-2 text-overline font-semibold uppercase text-text-tertiary first:pt-0">
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
      className="relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-flex h-6 w-11 rounded-full border-2 border-transparent transition-colors ${
          checked ? 'bg-primary' : 'bg-[var(--overlay-6)]'
        }`}
      >
        <span
          className={`block size-5 transform rounded-full bg-foreground shadow-lg transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </span>
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
