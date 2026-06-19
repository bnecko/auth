// A settings card: a white surface lifted by a hairline ring and a faint
// shadow, with the title in an elevated header strip across the top and rows
// beneath it. `data-mount-row` lets it ride the page-load stagger.

export function Section({
  title,
  hint,
  action,
  index,
  children,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
  index?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      data-mount-row
      className="mb-6 rounded-lg bg-card ring-1 ring-rule shadow-xs overflow-hidden"
    >
      <header className="h-14 px-4 flex items-center justify-between gap-3 bg-elevated border-b border-rule">
        <div className="flex items-baseline gap-2 min-w-0">
          {index && (
            <span className="text-[13px] text-faint tabular-nums shrink-0">
              {index}
            </span>
          )}
          <h2 className="text-[15px] font-semibold text-fg shrink-0">{title}</h2>
          {hint && (
            <span className="text-[13px] text-muted truncate">{hint}</span>
          )}
        </div>
        {action}
      </header>
      <div>{children}</div>
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
      className={[
        "grid grid-cols-[200px_1fr_auto] gap-4 px-4 py-3",
        "border-t border-rule first:border-t-0",
        "items-center text-[14px]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[13px] text-muted truncate">{children}</span>
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
        <span className="inline-flex items-center rounded bg-hover px-1.5 py-0.5 text-[11px] font-medium text-muted shrink-0">
          Private
        </span>
      )}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-4 py-8 text-[13px] text-muted text-center">
      {children}
    </div>
  );
}
