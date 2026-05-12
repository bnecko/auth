// Typographic glyph vocabulary. Field error states, Alert prefixes,
// Tag dots, Empty-state cursors, and Section bullets all reach into
// this list rather than embedding their own ad-hoc characters. The
// single source of truth keeps the terminal idiom legible: when a
// user sees `×` once, they see `×` every time.

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
  prompt: "text-accent",
  ok: "text-ok",
  error: "text-danger",
  warn: "text-accent",
  active: "text-accent",
  inactive: "text-faint",
  dot: "text-faint",
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
      className={`inline-block leading-none cursor-blink text-accent ${className}`}
    >
      ▌
    </span>
  );
}
