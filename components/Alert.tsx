type Tone = "danger" | "warning" | "info" | "success";

// A soft tinted banner: tone-matched background, hairline border, and text,
// with rounded corners so it reads as a contained message rather than a rule
// across the page.
const toneStyles: Record<Tone, string> = {
  danger: "bg-[#fdecec] border-[#f3c2c2] text-[#9f1c25]",
  warning: "bg-[#fff6e0] border-[#f1d28a] text-[#7a5200]",
  info: "bg-[#eaf2ff] border-[#bcd4ff] text-[#0b4ea8]",
  success: "bg-[#e9f7ec] border-[#bfe6c7] text-[#1c6b2b]",
};

export function Alert({
  tone = "info",
  className = "",
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={[
        "rounded-md border px-3 py-2.5 text-[13px] leading-snug",
        toneStyles[tone],
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
