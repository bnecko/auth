export function Divider({ label }: { label?: string }) {
  if (!label) return <hr className="border-rule" />;
  return (
    <div className="flex items-center gap-3 text-micro uppercase tracking-wider text-faint">
      <hr className="flex-1 border-rule" />
      <span>{label}</span>
      <hr className="flex-1 border-rule" />
    </div>
  );
}
