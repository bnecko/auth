type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

const styles: Record<Variant, string> = {
  primary:
    "bg-fg text-bg border border-fg hover:bg-secondary hover:border-secondary disabled:bg-border disabled:text-muted disabled:border-border",
  secondary:
    "bg-elevated text-fg border border-border hover:border-border-strong hover:bg-hover disabled:text-muted",
  ghost:
    "bg-transparent text-fg border border-border hover:border-border-strong hover:bg-hover disabled:text-muted",
  danger:
    "bg-transparent text-danger border border-border hover:border-danger/70 hover:bg-hover disabled:text-muted",
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
        "w-full h-10 rounded-sm text-[13px] tracking-tight",
        "transition-colors disabled:cursor-not-allowed",
        "inline-flex items-center justify-center gap-2",
        styles[variant],
        className,
      ].join(" ")}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="inline-flex items-center gap-1 text-muted">
          <span className="animate-pulse">|</span> loading
        </span>
      ) : (
        children
      )}
    </button>
  );
}
