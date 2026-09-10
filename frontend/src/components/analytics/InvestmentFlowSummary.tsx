import { ArrowUpRight, ArrowDownLeft, ArrowLeftRight } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ROUTES } from '@/constants'
import { formatCurrency } from '@/lib/formatters'
import type { summarizeInvestmentTransfers } from '@/lib/finance/investmentFlows'

interface Props {
  flows: ReturnType<typeof summarizeInvestmentTransfers>
  hasMappings: boolean
}

/** Renders the shared transfer model; internal moves never become contributions. */
export default function InvestmentFlowSummary({ flows, hasMappings }: Readonly<Props>) {
  if (!hasMappings) return null

  const rows = [
    { label: 'Contributed', value: flows.contributions, icon: ArrowUpRight },
    { label: 'Withdrawn', value: flows.withdrawals, icon: ArrowDownLeft },
    { label: 'Moved between investments', value: flows.internalTransfers, icon: ArrowLeftRight },
  ]

  return (
    <section aria-label="Investment funding" className="ledger-panel p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">Where your savings went</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Transfers across your configured investment accounts in the selected period.
          </p>
        </div>
        <Link
          to={ROUTES.INVESTMENT_ANALYTICS}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-md text-xs font-medium text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
        >
          Explore investments <ArrowUpRight className="size-3.5" aria-hidden="true" />
        </Link>
      </div>
      <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-[var(--hairline-1)] pt-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Net contributed</dt>
          <dd className="mt-2 break-words font-mono text-xl font-semibold tabular-nums text-foreground">
            {formatCurrency(flows.netContributions)}
          </dd>
          <dd className="mt-1 text-xs text-muted-foreground">Contributions less withdrawals</dd>
        </div>
        {rows.map(({ label, value, icon: Icon }) => (
          <div key={label} className="min-w-0">
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icon className="size-3.5 shrink-0" aria-hidden="true" /> {label}
            </dt>
            <dd className="mt-2 break-words font-mono text-base font-medium tabular-nums text-foreground">
              {formatCurrency(value)}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs leading-5 text-muted-foreground">
        Transfers change where money is held. Internal investment moves are shown separately from new funding.
      </p>
    </section>
  )
}
