import Link from "next/link";

// Auth pages center a single white card on the light canvas: brand mark above,
// the form inside the card lifted by a soft shadow, a quiet footer below. One
// focused object on the page, nothing competing with it.

function Monogram() {
  // Two narrow bars converging into one wider bar — a bottleneck silhouette.
  // Drawn inline so there's no extra request and the color stays accent-driven.
  return (
    <svg
      width="22"
      height="22"
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
  account,
}: {
  children: React.ReactNode;
  // Pages may still pass a `tag` breadcrumb; it is intentionally not rendered
  // in the light layout. Kept off the type via rest props so call sites compile.
  tag?: string;
  // When the page already has a signed-in user (e.g. the authorize screen),
  // pass it so the header reflects that.
  account?: { username: string } | null;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-canvas px-4 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex flex-col items-center gap-2 mb-6">
          <Link
            href="/"
            className="flex items-center gap-2 select-none group"
          >
            <Monogram />
            <span className="text-[16px] font-semibold tracking-tight text-fg">
              bottleneck
            </span>
          </Link>
          {account && (
            <span className="text-[13px] text-muted">
              Signed in as {account.username}
            </span>
          )}
        </div>

        <div className="bg-card border border-rule rounded-lg shadow-card p-7">
          {children}
        </div>

        <div className="mt-6 text-center text-[12px] text-faint">
          bottleneck · {new Date().getFullYear()}
        </div>
      </div>
    </main>
  );
}
