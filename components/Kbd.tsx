// Keyboard shortcut pill. Brackets are part of the glyph language —
// no border, no background, no rounded box. Just bracketed characters
// rendered in the muted shade so the keystroke reads as printed
// documentation rather than a "click me" affordance.
export function Kbd({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={`text-micro text-muted whitespace-nowrap ${className}`}>
      <span className="text-faint">[</span>
      {children}
      <span className="text-faint">]</span>
    </span>
  );
}
