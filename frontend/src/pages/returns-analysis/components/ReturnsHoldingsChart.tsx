import { motion } from 'motion/react'

import ChartEmptyState from '@/components/shared/ChartEmptyState'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { formatCurrency, formatCurrencyShort } from '@/lib/formatters'
import { useMotionStore } from '@/store/motionStore'

export interface InvestmentAccount {
  readonly name: string
  readonly balance: number
  readonly transactions: number
}

export default function ReturnsHoldingsChart({
  accounts,
}: Readonly<{ accounts: readonly InvestmentAccount[] }>) {
  const motionEnabled = useMotionStore((state) => state.mode === 'full')
  const displayedAccounts = accounts.slice(0, 12)
  const maxMagnitude = Math.max(0, ...displayedAccounts.map((account) => Math.abs(account.balance)))
  const hasNegativeBalance = displayedAccounts.some((account) => account.balance < 0)
  const topAccount = accounts[0]

  return (
    <motion.section
      className="ledger-panel @container min-w-0 p-4 sm:p-6"
      aria-labelledby="holdings-value-title"
      initial={motionEnabled ? { opacity: 0, y: 16 } : false}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: motionEnabled ? 0.45 : 0, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="mb-5">
        <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-app-blue">
          Wealth / account ledger
        </p>
        <h2 id="holdings-value-title" className="text-lg font-semibold tracking-tight text-foreground">
          Investment Accounts by Book Value
        </h2>
        <p className="mt-1 text-pretty text-xs leading-5 text-muted-foreground">
          Investment accounts ranked by ledger balance.
          {topAccount && <> Top account: <span className="font-medium text-foreground">{topAccount.name}</span>.</>}
        </p>
      </div>

      {accounts.length === 0 ? (
        <ChartEmptyState height={280} message="No investment account balances in the selected period" />
      ) : (
        <figure>
          <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2 border-b border-border/70 pb-3">
            <span className="text-xs font-medium text-muted-foreground">Account / recorded activity</span>
            <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
              Scale {formatCurrencyShort(hasNegativeBalance ? -maxMagnitude : 0)} to {formatCurrencyShort(maxMagnitude)}
            </span>
          </figcaption>
          <ol aria-label="Investment accounts ranked by book value">
            {displayedAccounts.map((account, index) => {
              const negative = account.balance < 0
              const ratio = maxMagnitude > 0 ? Math.abs(account.balance) / maxMagnitude : 0
              return (
                <motion.li
                  key={account.name}
                  className="grid min-w-0 grid-cols-[1.5rem_minmax(0,1fr)] gap-x-3 border-b border-border/50 py-4 last:border-b-0"
                  initial={motionEnabled ? { opacity: 0, y: 8 } : false}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{ duration: motionEnabled ? 0.3 : 0, delay: motionEnabled ? index * 0.035 : 0 }}
                >
                  <span className="pt-0.5 font-mono text-[11px] tabular-nums text-muted-foreground" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0">
                    <div className="flex min-w-0 flex-col gap-1.5 @[28rem]:flex-row @[28rem]:items-baseline @[28rem]:justify-between @[28rem]:gap-x-6">
                      <span className="min-w-0 break-words text-sm font-medium leading-5 text-foreground">{account.name}</span>
                      <span className={`break-words font-mono text-sm font-semibold tabular-nums ${negative ? 'text-app-red' : account.balance === 0 ? 'text-muted-foreground' : 'text-app-blue'}`}>
                        {formatCurrency(account.balance)}
                      </span>
                    </div>
                    <div className="relative my-2.5 h-2.5 rounded-sm bg-[var(--overlay-5)]" aria-hidden="true">
                      {hasNegativeBalance && (
                        <span className="absolute bottom-[-3px] left-1/2 top-[-3px] w-px bg-border-strong" />
                      )}
                      {account.balance === 0 ? (
                        <span
                          className="absolute top-1/2 size-1.5 -translate-y-1/2 rounded-full bg-muted-foreground"
                          style={{ left: hasNegativeBalance ? '50%' : 0 }}
                        />
                      ) : (
                        <motion.span
                          className={`absolute inset-y-0 rounded-sm ${negative ? 'origin-right bg-app-red' : 'origin-left bg-app-blue'}`}
                          style={{
                            width: hasNegativeBalance ? '50%' : '100%',
                            ...(negative ? { right: '50%' } : { left: hasNegativeBalance ? '50%' : 0 }),
                          }}
                          initial={motionEnabled ? { scaleX: 0 } : false}
                          whileInView={{ scaleX: ratio }}
                          viewport={{ once: true }}
                          transition={{ duration: motionEnabled ? 0.65 : 0, delay: motionEnabled ? index * 0.035 : 0, ease: [0.22, 1, 0.36, 1] }}
                        />
                      )}
                    </div>
                    <p className="font-mono text-[10px] tabular-nums text-muted-foreground">
                      {account.transactions} transaction{account.transactions === 1 ? '' : 's'}
                    </p>
                  </div>
                </motion.li>
              )
            })}
          </ol>
          <p className="mt-2 border-t border-border/70 pt-3 text-[11px] leading-5 text-muted-foreground">
            Book values reflect recorded cash flows. Market prices are not included.
            {accounts.length > 12 && <> Showing top 12 of {accounts.length} accounts; the accessible table includes every account.</>}
          </p>
        </figure>
      )}

      {chartDataTable(
        accounts,
        [
          { header: 'Account', rowHeader: true, value: (account) => account.name },
          { header: 'Book value', value: (account) => formatCurrency(account.balance) },
          { header: 'Transactions', value: (account) => String(account.transactions) },
        ],
        'Investment accounts ranked by ledger balance. All account values are included.',
        (account) => account.name,
      )}
    </motion.section>
  )
}
