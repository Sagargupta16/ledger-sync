import LoadingSkeleton, { SkeletonStatus } from '@/components/shared/LoadingSkeleton'

export default function RecurringListSkeleton() {
  return (
    <SkeletonStatus className="space-y-3" label="Loading recurring items">
      {Array.from({ length: 4 }, (_, index) => `recurring-row-${index + 1}`).map((rowKey) => (
        <LoadingSkeleton key={rowKey} className="h-24 sm:h-20" />
      ))}
    </SkeletonStatus>
  )
}
