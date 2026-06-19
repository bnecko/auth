type Variant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  loading?: boolean;
};

// Primary is the one filled control: the accent on a dark label. Secondary is
// a bordered white surface, ghost is borderless until hover, danger reads in
// red and only commits its border on intent.
const styles: Record<Variant, string> = {
  primary:
    "bg-accent text-fg hover:brightness-95 " +
    "disabled:bg-faint disabled:text-muted disabled:brightness-100",
  secondary:
    "bg-card text-fg border border-rule " +
    "hover:bg-hover hover:border-rule-strong " +
    "disabled:text-muted disabled:bg-card",
  ghost:
    "bg-transparent text-secondary " +
    "hover:bg-hover hover:text-fg " +
    "disabled:text-muted",
  danger:
    "bg-transparent text-danger border border-rule " +
    "hover:border-danger hover:bg-danger/5 " +
    "disabled:text-muted",
};

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

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
        "w-full h-10 px-4 text-[14px] font-medium rounded-md",
        "transition disabled:cursor-not-allowed",
        "inline-flex items-center justify-center gap-2",
        styles[variant],
        className,
      ].join(" ")}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}
