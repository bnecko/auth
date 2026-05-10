"use client";

import Link from "next/link";

type NavItem = {
  href: string;
  label: string;
  hash?: string;
  newWindow?: boolean;
};

const groups: { label: string; items: NavItem[] }[] = [
  {
    label: "account",
    items: [
      { href: "/#profile", label: "profile" },
      { href: "/#subscriptions", label: "subscriptions" },
      { href: "/#apps", label: "connected apps" },
      { href: "/#bearers", label: "api bearers" },
    ],
  },
  {
    label: "security",
    items: [
      { href: "/#sessions", label: "sessions" },
      { href: "/#security", label: "password & 2fa" },
      { href: "/#events", label: "recent events" },
    ],
  },
  {
    label: "developer",
    items: [
      { href: "/developers/apps", label: "oauth apps" },
      { href: "/developers/oauth", label: "oauth docs", newWindow: true },
      { href: "/developers/test-lab", label: "test field lab" },
    ],
  },
  {
    label: "support",
    items: [
      { href: "https://t.me/bottleneck_help", label: "telegram" },
      { href: "/#faq", label: "faq" },
    ],
  },
];

export function Sidebar({ user }: { user: { name: string; username: string } }) {
  return (
    <aside className="hidden md:flex w-[240px] shrink-0 flex-col border-r border-border bg-surface min-h-screen sticky top-0">
      <div className="px-5 py-5 border-b border-border">
        <Link href="/" className="block select-none">
          <div className="text-[15px] tracking-tightest text-fg">
            bottleneck
          </div>
          <div className="text-meta text-muted">oauth / console</div>
        </Link>
      </div>

      <div className="px-3 py-3 border-b border-border">
        <div className="flex items-center gap-2 px-2 h-8 border border-border rounded-sm bg-bg text-meta text-faint">
          <span>/</span>
          <span>search</span>
          <span className="ml-auto border border-border rounded-sm px-1 text-[10px] text-muted">
            ctrl k
          </span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-2 mb-1.5 text-micro uppercase text-faint tracking-[0.1em]">
              {g.label}
            </div>
            <ul className="space-y-px">
              {g.items.map((it) => (
                <li key={it.label}>
                  <Link
                    href={it.href}
                    target={it.newWindow ? "_blank" : undefined}
                    rel={it.newWindow ? "noreferrer" : undefined}
                    className="block px-2 h-7 leading-7 rounded-sm text-[13px] text-secondary hover:text-fg hover:bg-hover transition-colors"
                  >
                    {it.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="px-3 py-3 border-t border-border">
        <div className="flex items-center gap-2 px-2 py-2 rounded-sm hover:bg-hover transition-colors">
          <div
            className="h-6 w-6 rounded-sm bg-elevated border border-border flex items-center justify-center text-meta text-secondary"
            aria-hidden
          >
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[12.5px] text-fg truncate">{user.name}</div>
            <div className="text-meta text-muted truncate">@{user.username}</div>
          </div>
        </div>
      </div>
    </aside>
  );
}
