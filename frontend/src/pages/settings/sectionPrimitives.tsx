/**
 * Shared UI primitives for the Settings page sections.
 */

import { useState } from 'react'
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
  defaultCollapsed = false,
}: Readonly<{
  index: number
  icon: React.ElementType
  title: string
  description?: string
  children: React.ReactNode
  defaultCollapsed?: boolean
}>) {
  const [expanded, setExpanded] = useState(!defaultCollapsed)

  return (
    <motion.div
      custom={index}
      initial="hidden"
      animate="visible"
      variants={sectionVariants}
      className="glass rounded-2xl border border-border overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex items-center gap-3 w-full px-6 py-5 text-left hover:bg-white/5 transition-colors"
      >
        <div className="p-2 rounded-xl bg-primary/10">
          <Icon className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white">{title}</h2>
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
// Toggle switch
// ---------------------------------------------------------------------------

export function Toggle({
  checked,
  onChange,
  id,
}: Readonly<{
  checked: boolean
  onChange: (val: boolean) => void
  id?: string
}>) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
        checked ? 'bg-primary' : 'bg-white/20'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
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
}: Readonly<{ htmlFor?: string; children: React.ReactNode }>) {
  return (
    <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1.5">
      {children}
    </label>
  )
}

export function FieldHint({ children }: Readonly<{ children: React.ReactNode }>) {
  return <p className="text-xs text-muted-foreground mt-1">{children}</p>
}
