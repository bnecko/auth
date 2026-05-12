import Link from "next/link";

// Auth pages drop the bordered-card panel. The form sits on the bare
// page surrounded by rule lines and the scanline texture, framed by
// the monogram up top and the navigation strip at the bottom — the
// shape of a single page in a hardcover technical manual.

function Monogram() {
  // Custom mark: two narrow bars converging into one wider bar — a
  // bottleneck silhouette in monospaced glyph form. Drawn inline so
  // there's no extra HTTP request and the colors stay accent-driven.
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M3 1 V7 L8 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M17 1 V7 L12 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M8 12 H12" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

export function AuthShell({
  children,
  tag,
}: {
  children: React.ReactNode;
  tag?: string;
}) {
  return (
    <main className="scanlines min-h-screen flex flex-col">
      <header className="w-full max-w-[880px] mx-auto px-5 pt-6 pb-5 flex items-center justify-between">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-fg select-none group"
        >
          <Monogram />
          <span className="text-[14px] tracking-tightest group-hover:text-accent transition-colors">
            bottleneck
          </span>
          <span className="text-meta text-muted">/ auth</span>
        </Link>
        <nav className="flex items-center gap-5 text-meta text-secondary">
          <Link href="/login" className="hover:text-accent transition-colors">
            sign in
          </Link>
          <Link href="/register" className="hover:text-accent transition-colors">
            register
          </Link>
        </nav>
      </header>

      <div className="rule-x border-b border-rule" />

      <div className="flex-1 flex items-start justify-center px-5 pt-12 pb-16">
        <div className="w-full max-w-[440px]">
          {tag && (
            <div className="mb-5 text-meta text-muted flex items-baseline gap-2">
              <span className="text-accent">$</span>
              <span className="tracking-wider">{tag}</span>
            </div>
          )}
          <div className="rule-x border-b border-rule py-7">{children}</div>
          <div className="mt-5 text-meta text-faint flex items-center justify-between">
            <span>bnck-auth · {new Date().getFullYear()}</span>
            <span>tls / cf-tunnel</span>
          </div>
        </div>
      </div>
    </main>
  );
}
