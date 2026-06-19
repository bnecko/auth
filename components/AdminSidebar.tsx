"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/oauth-clients", label: "OAuth clients" },
  { href: "/admin/keys", label: "Signing keys" },
  { href: "/admin/activation-requests", label: "Activation requests" },
  { href: "/admin/webhooks", label: "Webhook deliveries" },
  { href: "/admin/bans", label: "Bans" },
  { href: "/admin/security", label: "Security events" },
];

function Monogram() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
      className="shrink-0"
    >
      <path d="M3 1 V7 L8 12 V19" stroke="var(--danger)" strokeWidth="1.5" />
      <path d="M17 1 V7 L12 12 V19" stroke="var(--danger)" strokeWidth="1.5" />
      <path d="M8 12 H12" stroke="var(--danger)" strokeWidth="1.5" />
    </svg>
  );
}

export function AdminSidebar({ username }: { username: string }) {
  const pathname = usePathname();

  return (
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-rule bg-card min-h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-rule">
        <Link href="/admin" className="flex items-center gap-2.5 select-none group">
          <Monogram />
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-fg group-hover:text-danger transition-colors">
              bottleneck
            </div>
            <div className="text-[11px] font-medium uppercase tracking-wider text-danger">
              Admin
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        <div className="px-2.5 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
          Controls
        </div>
        <ul className="space-y-0.5">
          {navItems.map(item => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-2.5 h-8 rounded-md text-[13px] transition-colors ${
                    active
                      ? "bg-[#fdecec] text-danger font-medium"
                      : "text-secondary hover:bg-hover hover:text-fg"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-3 border-t border-rule">
        <div className="flex items-center gap-2 px-2 py-2 text-[13px]">
          <span className="text-fg truncate">@{username}</span>
          <span className="ml-auto inline-flex items-center rounded bg-[#fdecec] px-1.5 py-0.5 text-[11px] font-medium text-danger">
            Root
          </span>
        </div>
      </div>
    </aside>
  );
}
