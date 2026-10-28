import type { AdminStats } from '@/services/api/admin'

import { FEATURE_LABELS, formatCount } from '../adminFormat'

function KeyValue({ label, value, mono = false }: Readonly<{ label: string; value: string; mono?: boolean }>) {
  return (
    <div className="flex min-w-0 items-baseline justify-between gap-3 border-b border-[var(--hairline-1)] py-2 text-sm last:border-b-0">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className={`min-w-0 truncate text-right text-foreground ${mono ? 'font-mono text-xs' : 'tabular-nums'}`}
        title={value}>
        {value}
      </dd>
    </div>
  )
}

/**
 * The server the page reads: release, database and applied migration, how many
 * accounts use each optional feature, and the size of the main tables.
 */
export default function AdminAppInfo({ app }: Readonly<{ app: AdminStats['app'] }>) {
  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:items-start">
      <section aria-labelledby="admin-app" className="ledger-panel p-4">
        <h2 id="admin-app" className="mb-1 text-sm font-semibold text-foreground">
          Server
        </h2>
        <dl>
          <KeyValue label="Version" value={app.version} />
          <KeyValue label="Database" value={app.database === 'postgresql' ? 'PostgreSQL' : app.database} />
          <KeyValue label="Migration" value={app.revision ?? 'not recorded'} mono />
        </dl>
      </section>
      <section aria-labelledby="admin-features" className="ledger-panel p-4">
        <h2 id="admin-features" className="mb-1 text-sm font-semibold text-foreground">
          Feature adoption
        </h2>
        <dl>
          {FEATURE_LABELS.map(([key, label]) => {
            const value = app.features[key as keyof AdminStats['app']['features']]
            return (
              <KeyValue key={key} label={label}
                value={value === null ? 'not migrated' : `${formatCount(value)} ${value === 1 ? 'account' : 'accounts'}`} />
            )
          })}
        </dl>
      </section>
      <section aria-labelledby="admin-tables" className="ledger-panel p-4">
        <h2 id="admin-tables" className="mb-1 text-sm font-semibold text-foreground">
          Table rows
        </h2>
        <dl>
          {app.tables.map((table) => (
            <KeyValue key={table.table} label={table.table} value={formatCount(table.rows)} />
          ))}
        </dl>
      </section>
    </div>
  )
}
