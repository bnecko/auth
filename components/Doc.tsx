// Shared typography for the public information pages (docs, FAQ, and the legal
// documents). Plain readable prose on the canvas rather than the app's card
// chrome, since these are read by signed-out visitors.

export function DocHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-8">
      <h1 className="text-[28px] tracking-tight text-fg leading-none mb-2">{title}</h1>
      {subtitle && <p className="text-[13px] text-muted">{subtitle}</p>}
    </header>
  );
}

export function DocSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-8">
      <h2 className="text-[16px] font-semibold text-fg mb-2.5">{heading}</h2>
      <div className="space-y-3 text-[13.5px] text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

export function DocList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="list-disc space-y-1.5 pl-5 text-[13.5px] text-secondary leading-relaxed">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}
