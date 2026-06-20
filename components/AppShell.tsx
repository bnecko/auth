"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  User,
  CreditCard,
  LayoutGrid,
  KeyRound,
  MonitorSmartphone,
  ShieldCheck,
  History,
  Settings,
  House,
  Boxes,
  BookOpen,
  FlaskConical,
  Send,
  CircleHelp,
  Search,
  PanelLeft,
  LogOut,
  LayoutDashboard,
  Users,
  ClipboardCheck,
  Webhook,
  Ban,
  ShieldAlert,
  LifeBuoy,
  MessagesSquare,
  Headset,
  type LucideIcon,
} from "lucide-react";
import { Kbd } from "./Kbd";

type NavGroup = {
  label: string;
  items: { href: string; label: string; icon: LucideIcon; newWindow?: boolean }[];
};

const USER_NAV: NavGroup[] = [
  {
    label: "Account",
    items: [
      { href: "/", label: "Account home", icon: House },
      { href: "/settings", label: "Settings", icon: Settings },
      { href: "/subscriptions", label: "Subscriptions", icon: CreditCard },
      { href: "/apps", label: "Connected apps", icon: LayoutGrid },
      { href: "/bearers", label: "API bearers", icon: KeyRound },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/developers/apps", label: "OAuth apps", icon: Boxes },
      { href: "/developers/oauth", label: "OAuth docs", icon: BookOpen },
      { href: "/developers/test-lab", label: "Test field lab", icon: FlaskConical },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/support", label: "Community support", icon: LifeBuoy },
      { href: "/support/mine", label: "My threads", icon: MessagesSquare },
      { href: "https://t.me/bottleneck_help", label: "Telegram", icon: Send, newWindow: true },
      { href: "/faq", label: "FAQ", icon: CircleHelp },
    ],
  },
];

const ADMIN_NAV: NavGroup[] = [
  {
    label: "Controls",
    items: [
      { href: "/admin", label: "Overview", icon: LayoutDashboard },
      { href: "/admin/users", label: "Users", icon: Users },
      { href: "/admin/oauth-clients", label: "OAuth clients", icon: Boxes },
      { href: "/admin/keys", label: "Signing keys", icon: KeyRound },
      { href: "/admin/activation-requests", label: "Activation requests", icon: ClipboardCheck },
      { href: "/admin/webhooks", label: "Webhook deliveries", icon: Webhook },
      { href: "/admin/bans", label: "Bans", icon: Ban },
      { href: "/admin/security", label: "Security events", icon: ShieldAlert },
      { href: "/security-review", label: "Security review", icon: ShieldAlert },
      { href: "/admin/supporters", label: "Supporters", icon: Headset },
    ],
  },
];

const SECURITY_GROUP: NavGroup = {
  label: "Security team",
  items: [{ href: "/security-review", label: "Security review", icon: ShieldAlert }],
};

type FlatItem = NavGroup["items"][number] & { group: string };

// The settings sub-pages live inside the /settings hub rather than the sidebar,
// but stay searchable in the palette and resolve correct breadcrumbs.
const SETTINGS_SEARCH: FlatItem[] = [
  { href: "/settings/profile", label: "Profile", icon: User, group: "Settings" },
  { href: "/settings/security", label: "Password & 2FA", icon: ShieldCheck, group: "Settings" },
  { href: "/settings/sessions", label: "Sessions", icon: MonitorSmartphone, group: "Settings" },
  { href: "/settings/activity", label: "Activity", icon: History, group: "Settings" },
];

function Monogram({ admin }: { admin?: boolean }) {
  const stroke = admin ? "var(--danger)" : "var(--accent)";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M3 1 V7 L8 12 V19" stroke={stroke} strokeWidth="1.5" />
      <path d="M17 1 V7 L12 12 V19" stroke={stroke} strokeWidth="1.5" />
      <path d="M8 12 H12" stroke={stroke} strokeWidth="1.5" />
    </svg>
  );
}

function SearchPalette({ items, onClose }: { items: FlatItem[]; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = query.trim()
    ? items.filter(
        it =>
          it.label.toLowerCase().includes(query.toLowerCase()) ||
          it.group.toLowerCase().includes(query.toLowerCase()),
      )
    : items;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  useEffect(() => {
    setSelected(0);
  }, [query]);

  function navigate(item: FlatItem) {
    onClose();
    if (item.newWindow) window.open(item.href, "_blank", "noreferrer");
    else router.push(item.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") return onClose();
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(i => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(i => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[selected]) {
      navigate(results[selected]);
    }
  }

  return (
    <div
      className="overlay-mount fixed inset-0 z-50 flex items-start justify-center pt-[18vh] px-5 bg-fg/20 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className="palette-mount w-full max-w-[600px] bg-card border border-rule rounded-xl shadow-elevated overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-rule">
          <Search size={16} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, settings, docs"
            aria-label="Search"
            className="flex-1 bg-transparent text-[15px] text-fg placeholder-faint outline-hidden focus:outline-hidden"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul role="listbox" aria-label="Search results" className="max-h-[360px] overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <li className="px-4 py-4 text-[13px] text-muted">
              No match{query && <> for &quot;{query}&quot;</>}
            </li>
          ) : (
            results.map((it, i) => {
              const Icon = it.icon;
              return (
                <li key={it.href} role="option" aria-selected={i === selected} className="px-1.5">
                  <button
                    type="button"
                    onClick={() => navigate(it)}
                    onMouseEnter={() => setSelected(i)}
                    className={`w-full text-left flex items-center gap-3 px-2.5 h-9 rounded-md text-[13px] transition-colors ${
                      i === selected ? "bg-hover text-fg" : "text-secondary"
                    }`}
                  >
                    <Icon size={15} className="shrink-0 text-muted" />
                    <span className="text-[12px] text-muted w-[64px] shrink-0">{it.group}</span>
                    <span className="flex-1 truncate">{it.label}</span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      </div>
    </div>
  );
}

export function AppShell({
  user,
  trail,
  isAdmin,
  isSecurity,
  variant = "user",
  children,
}: {
  user: { name: string; username: string };
  trail?: string;
  isAdmin?: boolean;
  isSecurity?: boolean;
  variant?: "user" | "admin";
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);

  const admin = variant === "admin";
  const nav = admin
    ? ADMIN_NAV
    : isSecurity
      ? [...USER_NAV, SECURITY_GROUP]
      : USER_NAV;
  const homeHref = admin ? "/admin" : "/";
  const flatItems: FlatItem[] = [
    ...nav.flatMap(g => g.items.map(it => ({ ...it, group: g.label }))),
    ...(admin ? [] : SETTINGS_SEARCH),
  ];
  const breadcrumb =
    trail ??
    (pathname === "/"
      ? "Account home"
      : flatItems.find(it => it.href === pathname)?.label ?? (admin ? "Admin" : "Account"));

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC"));
    setCollapsed(localStorage.getItem("bn-sidebar") === "collapsed");
  }, []);

  function toggleCollapsed() {
    setCollapsed(c => {
      const next = !c;
      localStorage.setItem("bn-sidebar", next ? "collapsed" : "expanded");
      return next;
    });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(o => !o);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="h-[58px] shrink-0 sticky top-0 z-30 bg-canvas border-b border-rule flex items-center px-4 gap-3">
        <Link href={homeHref} className="flex items-center gap-2 select-none group shrink-0">
          <Monogram admin={admin} />
          <span className="text-[15px] font-semibold tracking-tight text-fg group-hover:text-accent-strong transition-colors">
            bottleneck
          </span>
        </Link>
        {admin && (
          <span className="inline-flex items-center rounded bg-[#fdecec] px-1.5 py-0.5 text-[11px] font-medium text-danger">
            Admin
          </span>
        )}
        <span className="text-faint">/</span>
        <span className="text-[14px] text-secondary truncate">{breadcrumb}</span>
        <div className="ml-auto flex items-center gap-1">
          {admin ? (
            <Link
              href="/"
              className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-secondary hover:bg-hover hover:text-fg transition-colors"
            >
              Account
            </Link>
          ) : (
            <>
              {isAdmin && (
                <Link
                  href="/admin"
                  className="h-8 px-3 inline-flex items-center rounded-md text-[13px] text-secondary hover:bg-hover hover:text-fg transition-colors"
                >
                  Admin
                </Link>
              )}
              <Link
                href="/developers/oauth"
                aria-label="Docs"
                className="h-8 w-8 inline-flex items-center justify-center rounded-md text-muted hover:bg-hover hover:text-fg transition-colors"
              >
                <CircleHelp size={18} />
              </Link>
            </>
          )}
          <button
            type="button"
            onClick={signOut}
            aria-label="Sign out"
            className="h-8 px-3 inline-flex items-center gap-2 rounded-md text-[13px] text-secondary hover:bg-hover hover:text-danger transition-colors"
          >
            <LogOut size={16} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <div className="flex flex-1 min-h-0">
        <aside
          data-state={collapsed ? "collapsed" : "expanded"}
          className={`hidden md:flex shrink-0 flex-col border-r border-rule bg-canvas sticky top-[58px] h-[calc(100vh-58px)] overflow-hidden transition-[width] duration-[250ms] ease-[cubic-bezier(0.77,0,0.175,1)] motion-reduce:transition-none ${
            collapsed ? "w-[57px]" : "w-[260px]"
          }`}
        >
          <div className="p-3 border-b border-rule">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              title="Search"
              className="w-full h-9 flex items-center gap-2 px-2.5 rounded-lg border border-rule bg-card text-[13px] text-muted hover:border-rule-strong transition-colors"
            >
              <Search size={15} className="shrink-0 text-faint" />
              {!collapsed && (
                <>
                  <span>Search…</span>
                  <span className="ml-auto">
                    <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
                  </span>
                </>
              )}
            </button>
          </div>

          <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
            {nav.map(g => (
              <div key={g.label}>
                {!collapsed && (
                  <div className="px-2.5 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
                    {g.label}
                  </div>
                )}
                <ul className="space-y-0.5">
                  {g.items.map(it => {
                    const Icon = it.icon;
                    const isActive =
                      !it.newWindow &&
                      !it.href.startsWith("http") &&
                      !it.href.includes("#") &&
                      (pathname === it.href ||
                        (it.href !== "/" && pathname.startsWith(`${it.href}/`)));
                    return (
                      <li key={it.label}>
                        <Link
                          href={it.href}
                          target={it.newWindow ? "_blank" : undefined}
                          rel={it.newWindow ? "noreferrer" : undefined}
                          title={collapsed ? it.label : undefined}
                          className={`flex items-center gap-2.5 h-8 rounded-md text-[13px] transition-colors ${
                            collapsed ? "justify-center px-0" : "px-2.5"
                          } ${
                            isActive
                              ? "bg-hover text-fg font-medium"
                              : "text-secondary hover:bg-hover hover:text-fg"
                          }`}
                        >
                          <Icon size={16} className="shrink-0" />
                          {!collapsed && <span className="truncate">{it.label}</span>}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>

          <div className="border-t border-rule p-3 space-y-1">
            <Link
              href="/settings/profile"
              title={collapsed ? user.name : undefined}
              className={`flex items-center gap-2.5 rounded-md hover:bg-hover transition-colors ${
                collapsed ? "justify-center p-1.5" : "px-2 py-2"
              }`}
            >
              <span className="flex items-center justify-center w-7 h-7 rounded-full bg-hover text-[12px] font-medium text-secondary shrink-0">
                {user.name.charAt(0).toUpperCase()}
              </span>
              {!collapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] text-fg truncate">{user.name}</div>
                  <div className="text-[12px] text-muted truncate">@{user.username}</div>
                </div>
              )}
            </Link>
            <button
              type="button"
              onClick={toggleCollapsed}
              title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
              className={`w-full h-8 flex items-center gap-2.5 rounded-md text-[13px] text-muted hover:bg-hover hover:text-fg transition-colors ${
                collapsed ? "justify-center px-0" : "px-2.5"
              }`}
            >
              <PanelLeft size={16} className="shrink-0" />
              {!collapsed && <span>Collapse</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 min-w-0 bg-canvas">
          <div className="mx-auto w-full max-w-[1080px] px-6 md:px-8 lg:px-10 py-8">
            {children}
          </div>
        </main>
      </div>

      {searchOpen && <SearchPalette items={flatItems} onClose={() => setSearchOpen(false)} />}
    </div>
  );
}
