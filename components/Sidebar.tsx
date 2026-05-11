"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  group: string;
  newWindow?: boolean;
};

const groups: { label: string; items: Omit<NavItem, "group">[] }[] = [
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
      { href: "/security", label: "security center" },
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

const allItems: NavItem[] = groups.flatMap(g =>
  g.items.map(it => ({ ...it, group: g.label }))
);

function SearchPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = query.trim()
    ? allItems.filter(it =>
        it.label.includes(query.toLowerCase()) ||
        it.group.includes(query.toLowerCase())
      )
    : allItems;

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    setSelected(0);
  }, [query]);

  function navigate(item: NavItem) {
    onClose();
    if (item.newWindow) {
      window.open(item.href, "_blank", "noreferrer");
    } else {
      router.push(item.href);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(i => Math.min(i + 1, results.length - 1)); return; }
    if (e.key === "ArrowUp") { e.preventDefault(); setSelected(i => Math.max(i - 1, 0)); return; }
    if (e.key === "Enter" && results[selected]) { navigate(results[selected]); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] bg-surface border border-border rounded-sm shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-3 h-10 border-b border-border">
          <span className="text-faint text-meta">/</span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="search..."
            className="flex-1 bg-transparent text-[13px] text-fg placeholder-faint outline-none"
          />
          <span className="text-[10px] text-faint border border-border rounded-sm px-1">esc</span>
        </div>
        <ul className="max-h-[280px] overflow-y-auto py-1">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-[13px] text-muted">no results</li>
          ) : (
            results.map((it, i) => (
              <li key={it.href}>
                <button
                  type="button"
                  onClick={() => navigate(it)}
                  className={`w-full text-left flex items-center gap-3 px-3 h-8 text-[13px] transition-colors ${
                    i === selected ? "bg-elevated text-fg" : "text-secondary hover:bg-hover hover:text-fg"
                  }`}
                >
                  <span className="text-faint text-micro uppercase w-[72px] shrink-0">{it.group}</span>
                  <span>{it.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: { name: string; username: string } }) {
  const [searchOpen, setSearchOpen] = useState(false);
  // Detect Mac client-side to avoid hydration mismatch
  const [isMac, setIsMac] = useState(false);

  useEffect(() => {
    setIsMac(navigator.platform.toUpperCase().includes("MAC"));
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return (
    <>
      {/* layout spacer so flex siblings aren't obscured by the fixed sidebar */}
      <div className="hidden md:block w-[240px] shrink-0" aria-hidden />

      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[240px] flex-col border-r border-border bg-surface z-10">
        <div className="px-5 py-5 border-b border-border">
          <Link href="/" className="block select-none">
            <div className="text-[15px] tracking-tightest text-fg">bottleneck</div>
            <div className="text-meta text-muted">oauth / console</div>
          </Link>
        </div>

        <div className="px-3 py-3 border-b border-border">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-2 h-8 border border-border rounded-sm bg-bg text-meta text-faint hover:border-border-strong transition-colors"
          >
            <span>/</span>
            <span>search</span>
            <span className="ml-auto border border-border rounded-sm px-1 text-[10px] text-muted">
              {isMac ? "⌘K" : "Ctrl K"}
            </span>
          </button>
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

      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </>
  );
}
