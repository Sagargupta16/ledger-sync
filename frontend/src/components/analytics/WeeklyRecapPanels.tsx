import type { ReactNode } from 'react'

import { ArrowDownRight, ArrowUpRight } from 'lucide-react'
import { motion } from 'motion/react'
import { Link } from 'react-router'

import { Money } from '@/components/ui'
import { DURATION, EASING } from '@/constants/animations'
import { cn } from '@/lib/cn'
import { formatPercent } from '@/lib/formatters'
import type { CategoryMover, RecapAnomaly, RecapBills } from '@/services/api/weeklyRecap'
import { useMotionStore } from '@/store/motionStore'

import { countLabel, daysText, recapDay } from './weeklyRecapFacts'

const LINK_CLASS =
  'inline-flex min-h-11 items-center gap-1 text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]'
const ROW_CLASS =
  'flex min-h-11 items-center justify-between gap-3 border-b border-[var(--hairline-1)] py-2 last:border-b-0'

/** A 44px text link with a trailing arrow, for the recap's footers and notices. */
export function RecapLink({ to, children }: Readonly<{ to: string; children: ReactNode }>) {
  return (
    <Link to={to} className={LINK_CLASS}>
      {children} <ArrowUpRight className="size-3.5" aria-hidden="true" />
    </Link>
  )
}

function Panel({ title, subtitle, children, footer }: Readonly<{
  title: string
  subtitle: string
  children: ReactNode
  footer?: ReactNode
}>) {
  return (
    <section className="ledger-panel flex min-w-0 flex-col p-4 sm:p-5">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{subtitle}</p>
      <div className="mt-3 flex-1">{children}</div>
      {footer && <div className="mt-2 border-t border-[var(--hairline-1)] pt-1">{footer}</div>}
    </section>
  )
}

const emptyLine = (text: string) => <p className="py-2 text-xs leading-5 text-text-tertiary">{text}</p>

/** Up is red: these are spending categories, so a rise costs money. */
function MoverChange({ mover }: Readonly<{ mover: CategoryMover }>) {
  if (mover.change_pct === null) {
    return <span className="text-xs font-semibold text-app-blue">New</span>
  }
  const rose = mover.change > 0
  const Icon = rose ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold tabular-nums', rose ? 'text-app-red' : 'text-app-green')}>
      <Icon aria-hidden="true" className="size-3 shrink-0" />
      {formatPercent(mover.change_pct, true)}
    </span>
  )
}

export function MoversPanel({ movers, averageLabel, footer }: Readonly<{
  movers: CategoryMover[]
  averageLabel: string
  footer?: ReactNode
}>) {
  return (
    <Panel title="Top category movers" subtitle={`Last week against ${averageLabel}.`} footer={footer}>
      {movers.length === 0 ? emptyLine('No category spending moved last week.') : (
        <ul>
          {movers.map((mover) => (
            <li key={mover.category} className={ROW_CLASS}>
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{mover.category}</span>
                <MoverChange mover={mover} />
              </span>
              <Money value={mover.this_week} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function UpcomingPanel({ bills, href }: Readonly<{ bills: RecapBills; href: string }>) {
  return (
    <Panel
      title="Recurring bills due in the next 7 days"
      subtitle={`${recapDay(bills.window_start)} to ${recapDay(bills.window_end)}. Card statement dues are on the bill calendar.`}
      footer={<RecapLink to={href}>Open bill calendar</RecapLink>}
    >
      {bills.items.length === 0 ? emptyLine('No recurring bills fall due in the next 7 days.') : (
        <ul>
          {bills.items.map((bill) => (
            <li key={bill.id} className={ROW_CLASS}>
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">{bill.name}</span>
                <span className="block text-xs text-text-tertiary">
                  {bill.days_until <= 1 ? daysText(bill.days_until) : recapDay(bill.due_date)}
                  {bill.occurrences > 1 && `, ${countLabel(bill.occurrences, 'payment')}`}
                  {!bill.is_confirmed && ', detected'}
                </span>
              </span>
              <Money value={bill.total} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-app-red',
  high: 'bg-app-red',
  medium: 'bg-app-orange',
}

export function FlagsPanel({ anomalies, count, href }: Readonly<{
  anomalies: RecapAnomaly[]
  count: number
  href: string
}>) {
  return (
    <Panel
      title="Flagged last week"
      subtitle={`${countLabel(count, 'open anomaly', 'open anomalies')} about last week's transactions or its months.`}
      footer={<RecapLink to={href}>Review anomalies</RecapLink>}
    >
      <ul>
        {anomalies.map((flag) => (
          <li key={flag.id} className={cn(ROW_CLASS, 'items-start justify-start')}>
            <span aria-hidden="true" className={cn('mt-1.5 size-2 shrink-0 rounded-full', SEVERITY_DOT[flag.severity] ?? 'bg-app-yellow')} />
            <span className="min-w-0">
              <span className="block text-sm leading-5 text-foreground [overflow-wrap:anywhere]">{flag.description}</span>
              <span className="block text-xs capitalize text-text-tertiary">
                {flag.severity}{flag.occurred_on ? `, ${recapDay(flag.occurred_on)}` : ''}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

/** The model's three sentences, as plain text, labelled as an aid. */
export function ExplanationPanel({ narrative }: Readonly<{ narrative: string }>) {
  const reduceMotion = useMotionStore((state) => state.mode === 'reduced')
  return (
    <motion.div
      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : DURATION.default, ease: EASING.cinematic }}
      className="ledger-panel p-4 sm:p-5"
    >
      <p className="text-sm leading-6 text-foreground">{narrative}</p>
      <p className="mt-2 text-xs leading-5 text-text-tertiary">
        AI summary of the recap figures from your configured assistant. A computation aid, not advice.
      </p>
    </motion.div>
  )
}

/**
 * Nothing is dated from the week's Sunday to today. Usually an import lag, so
 * the week reads low until the next import; a quiet Sunday looks the same.
 */
export function IncompleteWeekNotice({ dataThrough, href }: Readonly<{ dataThrough: string; href: string }>) {
  return (
    <aside className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-app-orange/20 bg-app-orange/5 px-4 py-3">
      <p className="min-w-0 text-xs leading-5 text-muted-foreground">
        Your latest transaction is on {recapDay(dataThrough)}, so last week may be incomplete. Import newer data if you have it.
      </p>
      <RecapLink to={href}>Upload data</RecapLink>
    </aside>
  )
}
