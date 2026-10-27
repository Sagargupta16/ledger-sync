import { useState, type ReactNode } from 'react'

import { Settings2 } from 'lucide-react'

import ErrorState from '@/components/shared/ErrorState'
import { CardGridSkeleton } from '@/components/shared/LoadingSkeleton'
import { Button } from '@/components/ui'
import {
  usePinCategory,
  useReorderWatchTiles,
  useUnpinView,
  useWatchTiles,
} from '@/hooks/api/useWatchTiles'
import { useDemoStore } from '@/store/demoStore'

import WatchTileCard from './WatchTileCard'
import WatchTileSuggestions from './WatchTileSuggestions'

/**
 * Dashboard watchlist row: saved Transactions views pinned to the Dashboard,
 * each with its month-to-date total against the same days last month and the
 * last six complete months behind it. With nothing pinned it offers last
 * month's top spending categories as one-tap pins. Reads its own query, so a
 * page only places it; the figures do not follow the page's time filter.
 */
export default function WatchTiles() {
  const isDemoMode = useDemoStore((state) => state.isDemoMode)
  const tilesQuery = useWatchTiles()
  const reorder = useReorderWatchTiles()
  const unpin = useUnpinView()
  const pinCategory = usePinCategory()
  const [editing, setEditing] = useState(false)

  const data = tilesQuery.data
  const tiles = data?.tiles ?? []
  // A refetch in flight would land over a move made now with the older order.
  const busy = reorder.isPending || unpin.isPending || tilesQuery.isFetching
  const orderKey = tiles.map((tile) => tile.view_id).join(',')
  const canEdit = tiles.length > 0 && !isDemoMode

  const move = (index: number, direction: -1 | 1) => {
    const ids = tiles.map((tile) => tile.view_id)
    const target = index + direction
    if (target < 0 || target >= ids.length) return
    const [moved] = ids.splice(index, 1)
    ids.splice(target, 0, moved)
    reorder.mutate(ids)
  }

  const retry = () => void tilesQuery.refetch()
  let body: ReactNode
  if (tilesQuery.isPending) {
    body = <CardGridSkeleton count={2} cols="grid-cols-2 lg:grid-cols-4" />
  } else if (!data) {
    body = (
      <ErrorState
        variant="inline"
        errorType="network"
        message="Watch tiles could not load. No figure has been replaced with zero."
        onRetry={retry}
      />
    )
  } else if (tiles.length === 0) {
    body = (
      <WatchTileSuggestions
        suggestions={data.suggestions}
        month={data.suggestions_month}
        readOnly={isDemoMode}
        pendingCategory={pinCategory.isPending ? (pinCategory.variables ?? null) : null}
        onPin={(category) => pinCategory.mutate(category)}
      />
    )
  } else {
    body = (
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {tiles.map((tile, index) => (
          <WatchTileCard
            key={tile.view_id}
            tile={tile}
            period={data.period}
            editing={editing && canEdit}
            isFirst={index === 0}
            isLast={index === tiles.length - 1}
            busy={busy}
            orderKey={orderKey}
            onMove={(direction) => move(index, direction)}
            onUnpin={() => unpin.mutate(tile.view_id)}
          />
        ))}
      </ul>
    )
  }

  return (
    <section aria-labelledby="watch-tiles-heading" className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="watch-tiles-heading" className="text-sm font-semibold text-foreground">
            Watchlist
          </h2>
          <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
            Pinned saved views: this month so far against the same days last month.
          </p>
        </div>
        {/* The label carries the state (Arrange, then Done), so no aria-pressed. */}
        {canEdit && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEditing((on) => !on)}
            icon={<Settings2 className="size-3.5" />}
          >
            {editing ? 'Done' : 'Arrange'}
          </Button>
        )}
      </div>
      {data && tilesQuery.isError && (
        <ErrorState
          variant="inline"
          errorType="network"
          message="Could not refresh the watch tiles. These are the last figures loaded."
          onRetry={retry}
        />
      )}
      {body}
      <p className="text-xs leading-5 text-text-tertiary">
        {isDemoMode && 'Demo pins are a read-only preview. '}
        Each tile sums its view&apos;s expense rows, or the type the view filters, on the IST
        calendar. A computation aid, not financial advice.
      </p>
    </section>
  )
}
