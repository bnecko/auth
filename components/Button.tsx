type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

// Square, single hairline, one accent. Primary is amber bg + black
// fg — the only place the accent is filled rather than outlined.
// Secondary / ghost are rule-bordered. Danger is text-only with a
// muted rule until hover.
const styles: Record<Variant, string> = {
  primary:
    "bg-accent text-bg border border-accent " +
    "hover:bg-fg hover:border-fg " +
    "disabled:bg-faint disabled:border-faint disabled:text-muted",
  secondary:
    "bg-transparent text-fg border border-rule " +
    "hover:border-rule-strong hover:text-accent " +
    "disabled:text-muted disabled:border-rule",
  ghost:
    "bg-transparent text-secondary border border-transparent " +
    "hover:text-fg hover:border-rule " +
    "disabled:text-muted",
  danger:
    "bg-transparent text-danger border border-rule " +
    "hover:border-danger " +
    "disabled:text-muted",
};

export function Button({
  variant = "primary",
  loading,
  className = "",
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={[
        "w-full h-10 px-4 text-[13px] uppercase tracking-wider",
        "transition-colors disabled:cursor-not-allowed",
        "inline-flex items-center justify-center gap-2",
        styles[variant],
        className,
      ].join(" ")}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-2">
          <span className="cursor-blink">▌</span>
          <span>running</span>
        </span>
      ) : (
        children
      )}
    </button>
  );
}
