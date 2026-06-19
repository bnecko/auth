// Small glyph vocabulary for status marks. Tones are tuned to read on the
// light surface; the bright accent is reserved for fills, so accent-toned
// glyphs use the readable deeper amber.

type Kind = "prompt" | "ok" | "error" | "warn" | "active" | "inactive" | "dot";

const glyphs: Record<Kind, string> = {
  prompt: ">",
  ok: "+",
  error: "×",
  warn: "!",
  active: "■",
  inactive: "□",
  dot: "·",
};

const tones: Record<Kind, string> = {
  prompt: "text-muted",
  ok: "text-ok",
  error: "text-danger",
  warn: "text-accent-strong",
  active: "text-accent-strong",
  inactive: "text-faint",
  dot: "text-muted",
};

export function Glyph({
  kind,
  className = "",
  muted = false,
}: {
  kind: Kind;
  className?: string;
  muted?: boolean;
}) {
  return (
    <span
      aria-hidden="true"
      className={[
        "inline-block leading-none",
        muted ? "text-muted" : tones[kind],
        className,
      ].join(" ")}
    >
      {glyphs[kind]}
    </span>
  );
}

export function Cursor({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-block leading-none cursor-blink text-accent-strong ${className}`}
    >
      ▌
    </span>
  );
}
