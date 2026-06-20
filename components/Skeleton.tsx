// Loading "ghosts" shown while a route's data resolves, then replaced by the
// real UI with no entrance animation. The geometry mirrors the real cards so
// content drops in without a layout shift.

function SkeletonCard({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-lg bg-card ring-1 ring-rule shadow-xs overflow-hidden">
      <div className="h-14 px-4 flex items-center bg-elevated border-b border-rule">
        <div className="skeleton h-4 w-32" />
      </div>
      <div>
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between gap-4 px-4 py-3 border-t border-rule first:border-t-0"
          >
            <div className="skeleton h-3.5 w-40" />
            <div className="skeleton h-3.5 w-24" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div aria-hidden="true">
      <div className="mb-6">
        <div className="skeleton h-7 w-48 mb-3" />
        <div className="skeleton h-4 w-64" />
      </div>
      <div className="space-y-6">
        {Array.from({ length: cards }).map((_, i) => (
          <SkeletonCard key={i} rows={i === 0 ? 5 : 3} />
        ))}
      </div>
    </div>
  );
}
