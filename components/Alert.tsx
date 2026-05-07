type Tone = "danger" | "warning" | "info" | "success";

const toneClass: Record<Tone, string> = {
  danger: "border-danger/40 text-danger",
  warning: "border-warning/40 text-warning",
  info: "border-border text-secondary",
  success: "border-success/40 text-success",
};

const tonePrefix: Record<Tone, string> = {
  danger: "x",
  warning: "!",
  info: ">",
  success: "ok",
};

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
      className={`rounded-sm border ${toneClass[tone]} px-3 py-2 text-[12.5px] bg-bg flex items-start gap-2`}
    >
      <span aria-hidden className="font-bold opacity-80">
        {tonePrefix[tone]}
      </span>
      <span className="flex-1 leading-snug">{children}</span>
    </div>
  );
}
