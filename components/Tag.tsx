// Small status badge: a tinted, rounded pill carrying the tone. The `bracket`
// prop is kept for call-site compatibility but no longer affects the visual.

type Tone = "neutral" | "success" | "danger" | "warning" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "bg-hover text-secondary",
  success: "bg-[#e9f7ec] text-[#1c6b2b]",
  danger: "bg-[#fdecec] text-[#9f1c25]",
  warning: "bg-[#fff6e0] text-[#7a5200]",
  info: "bg-[#eaf2ff] text-[#0b4ea8]",
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
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
