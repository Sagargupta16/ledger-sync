import { motion } from 'motion/react'
import { CalendarClock, CreditCard, Info, Landmark, Receipt, Wallet } from 'lucide-react'

import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { PanelSkeleton } from '@/components/shared/LoadingSkeleton'
import MetricCard from '@/components/shared/MetricCard'
import { ROUTES } from '@/constants'
import { SCROLL_FADE_UP } from '@/constants/animations'
import { useCardCycles } from '@/hooks/api/useCardCycles'
import { formatCurrency } from '@/lib/formatters'
import type { CardCyclesResponse } from '@/services/api/cardCycles'

import CardStatementsTable from './CardStatementsTable'
import {
  dueInLabel,
  panelNotes,
  shortDate,
  summarizeCardCycles,
  type NextDue,
} from './cardCyclesSummary'
import PayingAccountsTable from './PayingAccountsTable'

const TITLE = 'Card statements'

function countLabel(n: number): string {
  return `${n} ${n === 1 ? 'card' : 'cards'}`
}

function nextLine(next: NextDue | null): string {
  if (!next) return 'No unpaid statement or open spend'
  const when = `${next.card}, ${shortDate(next.date)}`
  return next.billed ? when : `${when} (open cycle)`
}

function payingLine(paying: CardCyclesResponse['paying_accounts']): string {
  if (paying.length === 0) return 'No card names a paying account'
  if (paying.length === 1) return `Left in ${paying[0].name}`
  return `Across ${paying.length} paying accounts`
}

function Header({ subtitle }: Readonly<{ subtitle: string }>) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-app-purple/15">
        <CreditCard aria-hidden="true" className="size-4 text-app-purple" />
      </div>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-foreground">{TITLE}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  )
}

function Notes({ notes }: Readonly<{ notes: readonly string[] }>) {
  if (notes.length === 0) return null
  return (
    <output className="flex items-start gap-2.5 border-l-2 border-app-blue bg-app-blue/10 px-3 py-2.5 text-sm">
      <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-app-blue" />
      <span className="min-w-0 space-y-1 text-foreground">
        {notes.map((note) => (
          <span key={note} className="block">
            {note}
          </span>
        ))}
      </span>
    </output>
  )
}

/** Cards that exist but carry no card days: only a backup import brings them in. */
function MissingCardDays({ count }: Readonly<{ count: number }>) {
  const verb = count === 1 ? 'has' : 'have'
  return (
    <section className="ledger-panel space-y-4 p-4 sm:p-5">
      <Header subtitle="Statement cycles from your Money Manager card days" />
      <EmptyState
        icon={CreditCard}
        title="Card statements need your card days"
        description={`${countLabel(count)} ${verb} no statement or payment day. Import a Money Manager backup to bring them in.`}
        actionLabel="Import a backup"
        actionHref={ROUTES.UPLOAD}
        variant="compact"
      />
    </section>
  )
}

function KpiGrid({ data }: Readonly<{ data: CardCyclesResponse }>) {
  const summary = summarizeCardCycles(data)
  const { next, cashAfterDues } = summary
  const unpaidLine =
    summary.overdueCount > 0
      ? `${summary.overdueCount} overdue, ${summary.unpaidCount} unpaid in all`
      : `${summary.unpaidCount} of ${countLabel(data.cards.length)} unpaid`
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <MetricCard
        title="Due on statements"
        value={formatCurrency(summary.dueTotal)}
        subtitle={summary.unpaidCount > 0 ? unpaidLine : 'Every statement is paid'}
        icon={Receipt}
        color={summary.overdueCount > 0 ? 'red' : 'purple'}
      />
      <MetricCard
        title="Unbilled so far"
        value={formatCurrency(summary.unbilledTotal)}
        subtitle="Open cycles, billed at the next statement"
        icon={Wallet}
        color="blue"
      />
      <MetricCard
        title="Next due"
        value={next ? dueInLabel(next.days) : 'Nothing due'}
        subtitle={nextLine(next)}
        icon={CalendarClock}
        color={next && next.days < 0 ? 'red' : 'orange'}
      />
      <MetricCard
        title="Cash after dues"
        value={cashAfterDues === null ? 'Not set' : formatCurrency(cashAfterDues)}
        subtitle={payingLine(data.paying_accounts)}
        icon={Landmark}
        color={cashAfterDues !== null && cashAfterDues < 0 ? 'red' : 'green'}
      />
    </div>
  )
}

/**
 * Each credit card's latest statement and open cycle from the Money Manager
 * card days, with the cash left in the paying accounts after unpaid statements.
 * Renders nothing for a user with no credit cards.
 */
export default function CardCyclesPanel() {
  const query = useCardCycles()

  if (query.isLoading) return <PanelSkeleton blockClassName="h-20" blocks={3} />
  if (query.isError) {
    return (
      <ErrorState
        variant="card"
        title="Unable to load card statements"
        message="Your card statement cycles couldn't be loaded. Try again to see due dates."
        onRetry={() => {
          void query.refetch()
        }}
      />
    )
  }
  const data = query.data
  if (!data) return null
  if (data.cards.length === 0) {
    // Closed cards alone have nothing upcoming, and no cards means nothing to show.
    const missing = data.skipped.filter((card) => card.reason === 'no_settings').length
    return missing > 0 ? <MissingCardDays count={missing} /> : null
  }

  return (
    <motion.section {...SCROLL_FADE_UP} className="ledger-panel space-y-5 p-4 sm:p-5">
      <Header
        subtitle={`${countLabel(data.cards.length)} with statement cycles, as of ${shortDate(data.as_of)}`}
      />
      <KpiGrid data={data} />
      <CardStatementsTable cards={data.cards} />
      {data.paying_accounts.length > 0 && <PayingAccountsTable accounts={data.paying_accounts} />}
      <Notes notes={panelNotes(data.cards, data.skipped)} />
      <p className="text-xs leading-relaxed text-text-tertiary">
        Billed is what the card owed when the statement closed, so an unpaid earlier balance is
        included. Payments into the card after the statement date pay the oldest bill first.
      </p>
    </motion.section>
  )
}
