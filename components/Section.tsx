import { Cursor, Glyph } from "./Glyph";

// Sections drop the bordered-card pattern. Each one is structured
// like a printed RFC subsection: a numeric / mnemonic prefix
// alongside the title, a hairline rule beneath, content rows
// separated by rule lines, and a closing rule. No card fill, no
// rounded corners, no nested boxes.

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
    <section className="mb-10">
      <header className="flex items-baseline justify-between mb-3 gap-4">
        <div className="flex items-baseline gap-3 min-w-0">
          {index && (
            <span className="text-meta text-faint tabular-nums shrink-0">
              {index}
            </span>
          )}
          <h2 className="text-[15px] uppercase tracking-wider text-fg shrink-0">
            {title}
          </h2>
          {hint && (
            <span className="text-meta text-muted truncate">
              <span className="text-faint">// </span>
              {hint}
            </span>
          )}
        </div>
        {action}
      </header>
      <div className="rule-x border-b border-rule">{children}</div>
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
        "grid grid-cols-[180px_1fr_auto] gap-4 px-1 py-3",
        "border-t border-rule first:border-t-0",
        "items-center text-[13px]",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function RowLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-meta uppercase tracking-wider text-muted truncate">
      {children}
    </span>
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
        <span className="text-micro uppercase tracking-wider text-accent shrink-0">
          private
        </span>
      )}
    </span>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-1 py-8 text-meta text-muted flex items-center justify-center gap-2">
      <Glyph kind="prompt" muted />
      <span>{children}</span>
      <Cursor className="text-faint" />
    </div>
  );
}
