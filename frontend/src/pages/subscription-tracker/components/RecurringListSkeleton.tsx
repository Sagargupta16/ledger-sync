export default function RecurringListSkeleton() {
  return (
    <div className="space-y-3" aria-label="Loading recurring items">
      {Array.from({ length: 4 }, (_, index) => (
        <div
          key={index}
          className="h-24 animate-pulse rounded-xl bg-[var(--overlay-2)] sm:h-20"
        />
      ))}
    </div>
  )
}
