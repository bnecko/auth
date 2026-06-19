"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Kbd } from "./Kbd";

type NavItem = {
  href: string;
  label: string;
  group: string;
  newWindow?: boolean;
};

const groups: { label: string; items: Omit<NavItem, "group">[] }[] = [
  {
    label: "Account",
    items: [
      { href: "/#profile", label: "Profile" },
      { href: "/#subscriptions", label: "Subscriptions" },
      { href: "/#apps", label: "Connected apps" },
      { href: "/#bearers", label: "API bearers" },
    ],
  },
  {
    label: "Security",
    items: [
      { href: "/#sessions", label: "Sessions" },
      { href: "/#security", label: "Password & 2FA" },
      { href: "/#events", label: "Recent events" },
      { href: "/security", label: "Security center" },
    ],
  },
  {
    label: "Developer",
    items: [
      { href: "/developers/apps", label: "OAuth apps" },
      { href: "/developers/oauth", label: "OAuth docs", newWindow: true },
      { href: "/developers/test-lab", label: "Test field lab" },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "https://t.me/bottleneck_help", label: "Telegram" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
];

const allItems: NavItem[] = groups.flatMap(g =>
  g.items.map(it => ({ ...it, group: g.label })),
);

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
      <path d="M3 1 V7 L8 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M17 1 V7 L12 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M8 12 H12" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

function SearchPalette({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const results = query.trim()
    ? allItems.filter(
        it =>
          it.label.toLowerCase().includes(query.toLowerCase()) ||
          it.group.toLowerCase().includes(query.toLowerCase()),
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
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(i => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter" && results[selected]) {
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
        className="palette-mount w-full max-w-[580px] bg-card border border-rule rounded-lg shadow-elevated overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 p-4 border-b border-rule">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="Search pages, settings, docs"
            aria-label="Search"
            aria-controls="sidebar-search-results"
            aria-activedescendant={
              results[selected]
                ? `sidebar-search-option-${selected}`
                : undefined
            }
            className="flex-1 bg-transparent text-[15px] text-fg placeholder-faint outline-hidden focus:outline-hidden focus-visible:outline-hidden"
          />
          <Kbd>Esc</Kbd>
        </div>
        <ul
          id="sidebar-search-results"
          role="listbox"
          aria-label="Search results"
          className="max-h-[360px] overflow-y-auto py-1.5"
        >
          {results.length === 0 ? (
            <li className="px-4 py-4 text-[13px] text-muted">
              No match
              {query && (
                <>
                  {" for "}
                  <span className="text-fg">&quot;{query}&quot;</span>
                </>
              )}
            </li>
          ) : (
            results.map((it, i) => (
              <li
                key={it.href}
                id={`sidebar-search-option-${i}`}
                role="option"
                aria-selected={i === selected}
                className="px-1.5"
              >
                <button
                  type="button"
                  onClick={() => navigate(it)}
                  onMouseEnter={() => setSelected(i)}
                  className={`w-full text-left flex items-center gap-3 px-2.5 h-9 rounded-md text-[13px] transition-colors ${
                    i === selected ? "bg-hover text-fg" : "text-secondary"
                  }`}
                >
                  <span className="text-[12px] text-muted w-[64px] shrink-0">
                    {it.group}
                  </span>
                  <span className="flex-1 truncate">{it.label}</span>
                  {it.newWindow && (
                    <span className="text-faint text-[12px] shrink-0">↗</span>
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-4 h-9 border-t border-rule flex items-center justify-between text-[12px] text-muted">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5">
              <Kbd>↑↓</Kbd>
              <span>Navigate</span>
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              <span>Open</span>
            </span>
          </div>
          <span className="tabular-nums text-faint">
            {results.length}/{allItems.length}
          </span>
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ user }: { user: { name: string; username: string } }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMac, setIsMac] = useState(false);
  const pathname = usePathname();

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
      <div className="hidden md:block w-[240px] shrink-0" aria-hidden />

      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[240px] flex-col border-r border-rule bg-card z-10">
        <div className="px-5 py-5 border-b border-rule">
          <Link href="/" className="flex items-center gap-2.5 select-none group">
            <Monogram />
            <span className="text-[15px] font-semibold tracking-tight text-fg group-hover:text-accent-strong transition-colors">
              bottleneck
            </span>
          </Link>
        </div>

        <div className="px-3 py-3 border-b border-rule">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-center gap-2 px-2.5 h-9 rounded-md border border-rule text-[13px] text-muted hover:bg-hover transition-colors"
          >
            <span>Search</span>
            <span className="ml-auto">
              <Kbd>{isMac ? "⌘K" : "Ctrl K"}</Kbd>
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
          {groups.map(g => (
            <div key={g.label}>
              <div className="px-2.5 mb-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">
                {g.label}
              </div>
              <ul className="space-y-0.5">
                {g.items.map(it => {
                  const isActive =
                    !it.newWindow &&
                    !it.href.startsWith("http") &&
                    !it.href.includes("#") &&
                    pathname === it.href;
                  return (
                    <li key={it.label}>
                      <Link
                        href={it.href}
                        target={it.newWindow ? "_blank" : undefined}
                        rel={it.newWindow ? "noreferrer" : undefined}
                        className={`flex items-center gap-2 px-2.5 h-8 rounded-md text-[13px] transition-colors ${
                          isActive
                            ? "bg-hover text-fg font-medium"
                            : "text-secondary hover:bg-hover hover:text-fg"
                        }`}
                      >
                        <span className="truncate">{it.label}</span>
                        {it.newWindow && (
                          <span className="ml-auto text-faint text-[12px]">↗</span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-rule">
          <Link
            href={`/user/${user.username}`}
            className="flex items-center gap-2.5 px-2 py-2 rounded-md hover:bg-hover transition-colors"
          >
            <span className="flex items-center justify-center w-7 h-7 rounded-full bg-hover text-[12px] font-medium text-secondary shrink-0">
              {user.name.charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-fg truncate">{user.name}</div>
              <div className="text-[12px] text-muted truncate">
                @{user.username}
              </div>
            </div>
          </Link>
        </div>
      </aside>

      {searchOpen && <SearchPalette onClose={() => setSearchOpen(false)} />}
    </>
  );
}
