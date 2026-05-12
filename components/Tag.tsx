// Bracketed status marker. Square, hairline-bordered, uppercase. The
// bracket characters are part of the glyph; they sit in faint type so
// the body of the tag carries the tone. The `bracket` prop is kept
// for prop-compatibility with existing call sites but no longer
// changes the visual — both modes render the same way so callers
// don't drift apart.

type Tone = "neutral" | "success" | "danger" | "warning" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "text-secondary",
  success: "text-ok",
  danger: "text-danger",
  warning: "text-accent",
  info: "text-secondary",
};

export function Tag({
  children,
  tone = "neutral",
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- preserved for API compatibility
  bracket = true,
}: {
  children: React.ReactNode;
  tone?: Tone;
  bracket?: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center text-micro uppercase tracking-wider ${toneClass[tone]}`}
    >
      <span className="text-faint">[</span>
      <span className="px-1">{children}</span>
      <span className="text-faint">]</span>
    </span>
  );
}
