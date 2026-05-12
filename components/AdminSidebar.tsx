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

function Monogram() {
  return (
    <svg
      width="16"
      height="16"
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
    <aside className="hidden md:flex w-[220px] shrink-0 flex-col border-r border-rule bg-bg min-h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-rule">
        <Link href="/admin" className="flex items-center gap-2.5 select-none group">
          <Monogram />
          <div>
            <div className="text-[14px] tracking-tightest text-fg group-hover:text-danger transition-colors">
              bottleneck
            </div>
            <div className="text-micro uppercase tracking-wider text-danger">
              admin · root
            </div>
          </div>
        </Link>
      </div>

      <nav className="flex-1 px-3 py-5 overflow-y-auto">
        <div className="px-2 mb-2 text-micro uppercase tracking-wider text-faint flex items-baseline gap-2">
          <span className="tabular-nums">00</span>
          <span>controls</span>
        </div>
        <ul>
          {navItems.map((item, i) => {
            const active =
              item.href === "/admin"
                ? pathname === "/admin"
                : pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`group flex items-baseline gap-2 px-2 h-7 leading-7 text-[13px] transition-colors ${
                    active ? "text-danger" : "text-secondary hover:text-fg"
                  }`}
                >
                  <span
                    aria-hidden
                    className={`w-2 text-[10px] ${
                      active ? "text-danger" : "text-faint"
                    }`}
                  >
                    {active ? "■" : "·"}
                  </span>
                  <span className="text-faint text-micro tabular-nums w-6 shrink-0">
                    {String(i).padStart(2, "0")}
                  </span>
                  <span>{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="px-3 py-3 border-t border-rule">
        <div className="flex items-baseline gap-2 px-2 py-2 text-meta">
          <span className="text-danger" aria-hidden>
            ▌
          </span>
          <span className="text-fg truncate">@{username}</span>
          <span className="ml-auto text-micro uppercase tracking-wider text-danger">
            root
          </span>
        </div>
      </div>
    </aside>
  );
}
