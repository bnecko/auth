import Link from "next/link";

export function AuthShell({
  children,
  tag,
}: {
  children: React.ReactNode;
  tag?: string;
}) {
  return (
    <main className="min-h-screen flex flex-col px-4">
      <header className="w-full max-w-[1200px] mx-auto py-5 flex items-center justify-between text-meta">
        <Link
          href="/"
          className="flex items-center gap-2 text-fg select-none"
        >
          <span className="text-[15px] tracking-tightest">bottleneck</span>
          <span className="text-muted">/ auth</span>
        </Link>
        <nav className="flex items-center gap-5 text-secondary">
          <Link href="/login" className="hover:text-fg transition-colors">
            sign in
          </Link>
          <Link href="/register" className="hover:text-fg transition-colors">
            register
          </Link>
        </nav>
      </header>

      <div className="flex-1 flex items-center justify-center pb-16">
        <div className="w-full max-w-[440px]">
          {tag && (
            <div className="mb-3 text-meta text-muted">
              <span className="text-faint">[</span>
              <span>{tag}</span>
              <span className="text-faint">]</span>
            </div>
          )}
          <div className="border border-border bg-surface px-7 py-7 rounded-sm">
            {children}
          </div>
        </div>
      </div>
    </main>
  );
}
