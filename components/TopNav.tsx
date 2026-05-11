"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

export function TopNav({ trail, isAdmin }: { trail?: string; isAdmin?: boolean }) {
  const router = useRouter();

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

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
          {isAdmin && (
            <>
              <Link href="/admin" className="hover:text-fg transition-colors">
                admin
              </Link>
              <span className="text-faint">/</span>
            </>
          )}
          <button
            type="button"
            onClick={signOut}
            className="hover:text-fg transition-colors"
          >
            sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
