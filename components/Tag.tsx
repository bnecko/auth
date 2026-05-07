type Tone = "neutral" | "success" | "danger" | "warning" | "info";

const toneClass: Record<Tone, string> = {
  neutral: "text-secondary border-border",
  success: "text-success border-success/40",
  danger: "text-danger border-danger/40",
  warning: "text-warning border-warning/40",
  info: "text-info border-info/40",
};

export function Tag({
  children,
  tone = "neutral",
  bracket = true,
}: {
  children: React.ReactNode;
  tone?: Tone;
  bracket?: boolean;
}) {
  if (bracket) {
    return (
      <span className={`text-meta ${toneClass[tone].split(" ")[0]}`}>
        <span className="text-faint">{"{"}</span>
        {children}
        <span className="text-faint">{"}"}</span>
      </span>
    );
  }
  return (
    <span
      className={`inline-flex items-center px-1.5 h-[18px] border rounded-sm text-micro uppercase ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}
