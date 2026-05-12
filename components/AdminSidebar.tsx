"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "overview" },
  { href: "/admin/users", label: "users" },
  { href: "/admin/oauth-clients", label: "oauth clients" },
  { href: "/admin/keys", label: "signing keys" },
  { href: "/admin/activation-requests", label: "activation requests" },
  { href: "/admin/webhooks", label: "webhook deliveries" },
  { href: "/admin/bans", label: "bans" },
  { href: "/admin/security", label: "security events" },
];

export function AdminSidebar({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-border bg-surface min-h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/admin" className="block select-none">
          <div className="text-[15px] tracking-tightest text-fg">bottleneck</div>
          <div className="text-meta text-muted">admin console</div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-px overflow-y-auto">
        {navItems.map(item => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-2 h-7 leading-7 rounded-sm text-[13px] transition-colors ${
                active
                  ? "bg-elevated text-fg"
                  : "text-secondary hover:text-fg hover:bg-hover"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-sm text-meta">
          <div className="h-5 w-5 rounded-sm bg-elevated border border-border flex items-center justify-center text-[10px] text-secondary shrink-0">
            {username.slice(0, 1).toUpperCase()}
          </div>
          <span className="text-muted truncate">@{username}</span>
          <span className="ml-auto text-[10px] text-faint shrink-0">admin</span>
        </div>
      </div>
    </aside>
  );
}
