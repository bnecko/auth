import Link from "next/link";

export function TopNav({ trail }: { trail?: string }) {
  return (
    <header className="border-b border-border bg-bg sticky top-0 z-10 backdrop-blur">
      <div className="max-w-[1140px] mx-auto px-6 h-12 flex items-center justify-between text-meta">
        <div className="flex items-center gap-2 text-secondary">
          <Link href="/" className="text-fg hover:text-fg">
            ~
          </Link>
          <span className="text-faint">/</span>
          <span className="text-secondary">{trail ?? "account"}</span>
        </div>
        <nav className="flex items-center gap-4 text-secondary">
          <Link href="/admin" className="hover:text-fg transition-colors">
            admin
          </Link>
          <span className="text-faint">/</span>
          <form action="/api/auth/logout" method="POST" className="inline m-0 p-0">
            <button
              type="submit"
              className="hover:text-fg transition-colors"
            >
              sign out
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
