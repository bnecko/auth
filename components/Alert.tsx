import { Glyph } from "./Glyph";

type Tone = "danger" | "warning" | "info" | "success";

const toneGlyph: Record<Tone, Parameters<typeof Glyph>[0]["kind"]> = {
  danger: "error",
  warning: "warn",
  info: "prompt",
  success: "ok",
};

const toneText: Record<Tone, string> = {
  danger: "text-danger",
  warning: "text-accent",
  info: "text-secondary",
  success: "text-ok",
};

// No bordered box. The alert is a horizontal strip framed top and
// bottom by hairline rules; the glyph carries the tone and lives
// in the same column as the body text. Lets the alert sit inline
// with surrounding content instead of breaking the rhythm with a
// pill shape.
export function Alert({
  tone = "info",
  children,
}: {
  tone?: Tone;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className="rule-x border-b border-rule py-2.5 px-1 text-[13px] flex items-baseline gap-3"
    >
      <Glyph kind={toneGlyph[tone]} className={toneText[tone]} />
      <div className="flex-1 leading-snug text-fg">{children}</div>
    </div>
  );
}
