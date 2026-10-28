import { DataTable, type DataTableColumn } from '@/components/ui'
import type { AdminStats } from '@/services/api/admin'

import { formatCount, formatUsd } from '../adminFormat'

type ModelRow = AdminStats['ai']['by_model_30d'][number]

const COLUMNS: DataTableColumn<ModelRow>[] = [
  {
    key: 'model',
    header: 'Model',
    align: 'left',
    sortable: true,
    sortType: 'text',
    mobilePrimary: true,
    mobileLabel: '',
    cell: (row) => <span className="break-all font-mono text-xs text-foreground">{row.model}</span>,
  },
  { key: 'calls', header: 'Calls', align: 'right', sortable: true, cell: (row) => formatCount(row.calls) },
  { key: 'tokens', header: 'Tokens', align: 'right', sortable: true, cell: (row) => formatCount(row.tokens) },
  { key: 'cost_usd', header: 'Est. spend', align: 'right', sortable: true, cell: (row) => formatUsd(row.cost_usd) },
]

/** AI calls, tokens and estimated spend per model over the last 30 days, every account together. */
export default function AdminModelsTable({ rows }: Readonly<{ rows: AdminStats['ai']['by_model_30d'] }>) {
  return (
    <section aria-labelledby="admin-ai-models" className="ledger-panel space-y-3 p-4">
      <h2 id="admin-ai-models" className="text-sm font-semibold text-foreground">
        AI by model, 30 days
      </h2>
      <DataTable
        columns={COLUMNS}
        rows={rows}
        rowKey={(row) => row.model}
        initialSort={{ key: 'calls', dir: 'desc' }}
        ariaLabel="AI calls, tokens and estimated spend per model over 30 days"
        mobileCards
        emptyState={<p className="py-6 text-center text-sm text-muted-foreground">No AI calls in the last 30 days.</p>}
      />
    </section>
  )
}
