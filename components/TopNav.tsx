"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Glyph } from "./Glyph";

// Console-style top bar — no backdrop blur, no shadow. A single
// hairline rule under the bar, breadcrumb on the left written as a
// `$` shell path, sign-out on the right with a > prompt mark.
export function TopNav({
  trail,
  isAdmin,
}: {
  trail?: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <header className="border-b border-rule bg-bg sticky top-0 z-10">
      <div className="max-w-[1140px] mx-auto px-6 h-11 flex items-center justify-between text-meta">
        <div className="flex items-baseline gap-2">
          <span className="text-accent" aria-hidden>
            $
          </span>
          <Link
            href="/"
            className="text-fg hover:text-accent transition-colors tracking-wider"
          >
            bottleneck
          </Link>
          <span className="text-faint">/</span>
          <span className="text-secondary tracking-wider">{trail ?? "account"}</span>
        </div>
        <nav className="flex items-baseline gap-4 text-muted">
          {isAdmin && (
            <>
              <Link
                href="/admin"
                className="hover:text-accent transition-colors flex items-baseline gap-1.5 uppercase tracking-wider"
              >
                <Glyph kind="active" className="text-[10px]" />
                <span>admin</span>
              </Link>
              <span className="text-faint">·</span>
            </>
          )}
          <button
            type="button"
            onClick={signOut}
            className="hover:text-danger transition-colors uppercase tracking-wider"
          >
            sign-out
          </button>
        </nav>
      </div>
    </header>
  );
}
