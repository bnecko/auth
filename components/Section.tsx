import type { LucideIcon } from "lucide-react";

// A settings card: a white surface lifted by a hairline ring and a faint
// shadow, with the title (and an optional leading icon) in an elevated header
// strip across the top and rows beneath it. The danger tone swaps the grey
// frame for the pastel red one so destructive sections announce themselves
// before any control is read.

type SectionTone = "neutral" | "danger";

const sectionTone: Record<
  SectionTone,
  { frame: string; title: string; icon: string; hint: string; body: string }
> = {
  neutral: {
    frame: "bg-elevated ring-rule",
    title: "text-fg",
    icon: "text-muted",
    hint: "text-muted",
    body: "ring-rule",
  },
  danger: {
    frame: "bg-danger-soft ring-danger-border",
    title: "text-danger-strong",
    icon: "text-danger-strong",
    hint: "text-danger-strong/70",
    body: "ring-danger-border",
  },
};

export function Section({
  title,
  icon: Icon,
  hint,
  action,
  index,
  tone = "neutral",
  children,
}: {
  title: string;
  icon?: LucideIcon;
  hint?: string;
  action?: React.ReactNode;
  index?: string;
  tone?: SectionTone;
  children: React.ReactNode;
}) {
  const styles = sectionTone[tone];
  return (
    <section
      className={`mb-5 rounded-xl ring-1 shadow-xs overflow-hidden ${styles.frame}`}
    >
      <header className="h-11 px-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {index && (
            <span className="text-[13px] text-faint tabular-nums shrink-0">
              {index}
            </span>
          )}
          {Icon && <Icon size={15} className={`${styles.icon} shrink-0`} />}
          <h2 className={`text-[14px] font-semibold shrink-0 ${styles.title}`}>
            {title}
          </h2>
          {hint && (
            <span className={`text-[13px] truncate ${styles.hint}`}>{hint}</span>
          )}
        </div>
        {action}
      </header>
      {/* White, full-width body panel. The card itself is the elevated (grey
          or pastel red) surface, so the panel's rounded corners reveal the
          frame color, not white. */}
      <div
        className={`m-1 mt-0 rounded-lg ring-1 bg-card overflow-hidden ${styles.body}`}
      >
        {children}
      </div>
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
