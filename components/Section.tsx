export function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-9">
      <header className="flex items-baseline justify-between mb-2.5">
        <div className="flex items-baseline gap-3">
          <h2 className="text-micro uppercase tracking-[0.08em] text-muted">
            {title}
          </h2>
          {hint && (
            <span className="text-meta text-faint">{hint}</span>
          )}
        </div>
        {action}
      </header>
      <div className="border border-border bg-surface rounded-sm">{children}</div>
    </section>
  );
}

export function Row({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`grid grid-cols-[180px_1fr_auto] gap-4 px-4 py-2.5 border-b border-border last:border-b-0 items-center text-[13px] hover:bg-hover/50 transition-colors ${className}`}
    >
      {children}
    </div>
  );
}

export function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-meta text-muted truncate">{children}</span>
  );
}

export function RowValue({
  children,
  privateField,
}: {
  children: React.ReactNode;
  privateField?: boolean;
}) {
  return (
    <span className="text-fg flex items-center gap-2 min-w-0">
      <span className="truncate">{children}</span>
      {privateField && (
        <span className="text-micro uppercase text-warning shrink-0">
          private
        </span>
      )}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-meta text-faint text-center">
      {children}
    </div>
  );
}
