/**
 * Expense categories as a zoomable treemap, drawn from the same breakdown, date range and colours as the
 * CategoryBreakdown list beside it: a tile's area is its category's share of spending, and opening a
 * category shows its subcategories. A deep-linked category opens on arrival.
 */

import { useMemo } from 'react'
import { CreditCard, LayoutGrid } from 'lucide-react'

import Treemap, { type TreemapNode } from '@/components/charts/Treemap'
import EmptyState from '@/components/shared/EmptyState'
import ErrorState from '@/components/shared/ErrorState'
import { ChartSkeleton } from '@/components/shared/LoadingSkeleton'
import { chartDataTable } from '@/components/ui/chartDataTable'
import { useCategoryBreakdown } from '@/hooks/api/useAnalytics'
import { usePaletteSnapshot } from '@/hooks/usePaletteSnapshot'
import { formatCurrency, formatPercent } from '@/lib/formatters'
import { EXPENSE_CATEGORY_COLORS } from '@/constants/categoryColors'
import { CHART_COLORS } from '@/constants/chartColors'

import { buildCategories } from './categoryBreakdownUtils'

const TITLE = 'Expense Map'
const ARIA_LABEL = 'Treemap of expenses by category, each tile sized by its share of spending. Arrow keys move between tiles, Enter opens a category and Escape goes back.'
/** `buildCategories` also attaches sparkline history, which the treemap does not draw. */
const NO_HISTORY = new Map<string, number[]>()

type Category = ReturnType<typeof buildCategories>['categories'][number]

interface TableRow {
  readonly key: string
  readonly path: string
  readonly amount: number
  readonly share: string
}

interface CategoryTreemapProps {
  readonly dateRange?: { start_date?: string | null; end_date?: string | null }
  /** Opens this category on arrival, as `/spending?category=Food` does. */
  readonly categoryFilter?: string | null
}

export default function CategoryTreemap({ dateRange, categoryFilter }: CategoryTreemapProps) {
  const { data, isLoading, isError, refetch } = useCategoryBreakdown({
    transaction_type: 'expense',
    start_date: dateRange?.start_date ?? undefined,
    end_date: dateRange?.end_date ?? undefined,
  })
  // Theme-scoped copies of the in-place palettes, so tiles re-colour on a toggle. The list passes the same
  // two, so a category has one colour in both.
  const colorMap = usePaletteSnapshot(EXPENSE_CATEGORY_COLORS)
  const fallbackColors = usePaletteSnapshot(CHART_COLORS)
  const categories = useMemo(
    () => buildCategories(data, colorMap, fallbackColors, NO_HISTORY, null).categories.filter((cat) => cat.total > 0),
    [data, colorMap, fallbackColors],
  )
  const nodes = useMemo(() => categories.map((cat): TreemapNode => ({
    id: cat.name,
    label: cat.name,
    value: cat.total,
    color: cat.color,
    children: cat.subcategories.map((sub) => ({ id: sub.name, label: sub.name, value: sub.amount })),
  })), [categories])
  const rows = useMemo(() => tableRows(categories), [categories])

  if (isLoading) {
    return <ChartSkeleton height="h-80" />
  }

  if (isError) {
    return (
      <ErrorState
        variant="card"
        title={`Unable to load the ${TITLE}`}
        message="Your category totals couldn't be loaded. Try again to see the map."
        onRetry={() => { void refetch() }}
      />
    )
  }

  if (nodes.length === 0) {
    return (
      <div className="ledger-panel p-4 sm:p-5">
        <EmptyState
          icon={CreditCard}
          title="No expenses to map"
          description="Spending in this range shows here as tiles sized by amount."
          variant="chart"
        />
      </div>
    )
  }

  return (
    <div className="ledger-panel min-w-0 p-4 sm:p-5">
      <div className="mb-3 flex items-center gap-3">
        <LayoutGrid className="size-5 shrink-0 text-app-purple" aria-hidden="true" />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-foreground">{TITLE}</h3>
          <p className="text-xs text-text-tertiary">Tile area is each category&apos;s share of spending. Select a category to open its subcategories.</p>
        </div>
      </div>
      <Treemap nodes={nodes} formatValue={formatCurrency} rootLabel="All expenses" zoomTo={categoryFilter ?? null} ariaLabel={ARIA_LABEL} />
      {/* Beside the frame, never inside it: the frame's role="img" would hide the table again. */}
      {chartDataTable(
        rows,
        [
          { header: 'Category', rowHeader: true, value: (row) => row.path },
          { header: 'Amount', value: (row) => formatCurrency(row.amount) },
          { header: 'Share', value: (row) => row.share },
        ],
        `${TITLE} data`,
        (row) => row.key,
      )}
    </div>
  )
}

/** Every category, then each of its subcategories, with its share of the level it sits in. */
function tableRows(categories: readonly Category[]): TableRow[] {
  return categories.flatMap((cat) => [
    { key: cat.name, path: cat.name, amount: cat.total, share: `${formatPercent(cat.percent)} of total` },
    ...cat.subcategories.filter((sub) => sub.amount > 0).map((sub) => ({
      key: `${cat.name}\u001f${sub.name}`,
      path: `${cat.name} / ${sub.name}`,
      amount: sub.amount,
      share: `${formatPercent(sub.percent)} of ${cat.name}`,
    })),
  ])
}
