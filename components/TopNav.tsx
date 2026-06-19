"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Top bar: white surface, a single hairline beneath, brand and breadcrumb on
// the left, admin link and sign-out on the right.
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
    <header className="border-b border-rule bg-card sticky top-0 z-10">
      <div className="max-w-[1140px] mx-auto px-6 h-14 flex items-center justify-between text-[14px]">
        <div className="flex items-center gap-2">
          <Link href="/" className="font-semibold text-fg hover:text-accent-strong transition-colors">
            bottleneck
          </Link>
          <span className="text-faint">/</span>
          <span className="text-secondary">{trail ?? "Account"}</span>
        </div>
        <nav className="flex items-center gap-4 text-[13px]">
          {isAdmin && (
            <Link
              href="/admin"
              className="text-secondary hover:text-fg transition-colors"
            >
              Admin
            </Link>
          )}
          <button
            type="button"
            onClick={signOut}
            className="text-secondary hover:text-danger transition-colors"
          >
            Sign out
          </button>
        </nav>
      </div>
    </header>
  );
}
