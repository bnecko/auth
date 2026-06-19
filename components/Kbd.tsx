// Keyboard shortcut key: a small bordered, rounded cap.
export function Kbd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded border border-rule bg-card px-1.5 py-0.5 text-[11px] text-secondary whitespace-nowrap ${className}`}
    >
      {children}
    </span>
  );
}
