import Link from "next/link";
import { getCurrentSession } from "@/lib/server/session";

// Public chrome for the support area. Unlike the (app) layout this does not
// require a session - logged-out visitors can read public threads - so it
// renders its own lightweight header instead of the full AppShell sidebar.
export default async function SupportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const current = await getCurrentSession();
  const signedIn = !!current;

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="h-[58px] shrink-0 sticky top-0 z-30 bg-canvas border-b border-rule flex items-center px-4 gap-3">
        <Link href="/" className="flex items-center gap-2 select-none shrink-0">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
            <path d="M3 1 V7 L8 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
            <path d="M17 1 V7 L12 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
            <path d="M8 12 H12" stroke="var(--accent)" strokeWidth="1.5" />
          </svg>
          <span className="text-[15px] font-semibold tracking-tight text-fg">bottleneck</span>
        </Link>
        <span className="text-faint">/</span>
        <Link
          href="/support"
          className="text-[14px] text-secondary hover:text-fg transition-colors"
        >
          Support
        </Link>
        <div className="ml-auto flex items-center gap-1">
          {signedIn ? (
            <>
              <Link
                href="/support/new"
                className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-secondary hover:bg-hover hover:text-fg transition-colors"
              >
                New thread
              </Link>
              <Link
                href="/"
                className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-secondary hover:bg-hover hover:text-fg transition-colors"
              >
                Account
              </Link>
            </>
          ) : (
            <Link
              href="/login?next=/support"
              className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-secondary hover:bg-hover hover:text-fg transition-colors"
            >
              Sign in
            </Link>
          )}
        </div>
      </header>

      <main className="flex-1 min-w-0">
        <div className="mx-auto w-full max-w-[860px] px-6 md:px-8 py-8">{children}</div>
      </main>
    </div>
  );
}
