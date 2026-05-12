"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Cursor, Glyph } from "./Glyph";
import { Kbd } from "./Kbd";

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
          it.label.includes(query.toLowerCase()) ||
          it.group.includes(query.toLowerCase()),
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
      className="fixed inset-0 z-50 flex items-start justify-center pt-[14vh] px-5 bg-bg/70"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="search"
        className="w-full max-w-[480px] bg-bg border border-rule-strong overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-baseline gap-2 px-3 h-11 border-b border-rule">
          <span className="text-accent" aria-hidden="true">
            $
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="locate..."
            aria-label="search"
            aria-controls="sidebar-search-results"
            aria-activedescendant={
              results[selected] ? `sidebar-search-option-${selected}` : undefined
            }
            className="flex-1 bg-transparent text-[14px] text-fg placeholder-faint outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <ul
          id="sidebar-search-results"
          role="listbox"
          aria-label="search results"
          className="max-h-[320px] overflow-y-auto py-1"
        >
          {results.length === 0 ? (
            <li className="px-3 py-3 text-[13px] text-muted flex items-baseline gap-2">
              <Glyph kind="prompt" muted />
              <span>no results</span>
            </li>
          ) : (
            results.map((it, i) => (
              <li
                key={it.href}
                id={`sidebar-search-option-${i}`}
                role="option"
                aria-selected={i === selected}
              >
                <button
                  type="button"
                  onClick={() => navigate(it)}
                  className={`w-full text-left flex items-baseline gap-3 px-3 h-9 text-[13px] transition-colors ${
                    i === selected
                      ? "text-accent"
                      : "text-secondary hover:text-fg"
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className={`w-3 ${i === selected ? "text-accent" : "text-faint"}`}
                  >
                    {i === selected ? "▸" : ""}
                  </span>
                  <span className="text-faint text-micro uppercase tracking-wider w-[72px] shrink-0">
                    {it.group}
                  </span>
                  <span>{it.label}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="px-3 h-9 border-t border-rule flex items-center justify-end gap-3 text-meta text-faint">
          <span className="flex items-center gap-1.5">
            <Kbd>↑↓</Kbd>
            <span>nav</span>
          </span>
          <span className="flex items-center gap-1.5">
            <Kbd>↵</Kbd>
            <span>open</span>
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

      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[240px] flex-col border-r border-rule bg-bg z-10">
        <div className="px-5 py-5 border-b border-rule">
          <Link
            href="/"
            className="flex items-center gap-2.5 select-none group"
          >
            <Monogram />
            <div>
              <div className="text-[14px] tracking-tightest text-fg group-hover:text-accent transition-colors">
                bottleneck
              </div>
              <div className="text-micro uppercase tracking-wider text-faint">
                console
              </div>
            </div>
          </Link>
        </div>

        <div className="px-3 py-3 border-b border-rule">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="w-full flex items-baseline gap-2 px-2 h-9 text-meta text-muted hover:text-accent transition-colors group"
          >
            <span className="text-accent">$</span>
            <span>locate</span>
            <span className="ml-auto">
              <Kbd>{isMac ? "⌘K" : "ctrl·k"}</Kbd>
            </span>
          </button>
        </div>

        <nav className="flex-1 px-3 py-5 space-y-6 overflow-y-auto">
          {groups.map((g, gi) => (
            <div key={g.label}>
              <div className="px-2 mb-2 text-micro uppercase tracking-wider text-faint flex items-baseline gap-2">
                <span className="tabular-nums">
                  {String(gi + 1).padStart(2, "0")}
                </span>
                <span>{g.label}</span>
              </div>
              <ul>
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
                        className={`group flex items-baseline gap-2 px-2 h-7 leading-7 text-[13px] transition-colors ${
                          isActive
                            ? "text-accent"
                            : "text-secondary hover:text-fg"
                        }`}
                      >
                        <span
                          aria-hidden="true"
                          className={`w-2 text-[10px] ${
                            isActive ? "text-accent" : "text-faint"
                          } group-hover:text-accent transition-colors`}
                        >
                          {isActive ? "■" : "·"}
                        </span>
                        <span>{it.label}</span>
                        {it.newWindow && (
                          <span className="ml-auto text-faint text-micro">
                            ↗
                          </span>
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
            className="flex items-baseline gap-2 px-2 py-2 text-meta hover:text-accent transition-colors"
          >
            <span className="text-accent" aria-hidden="true">
              ▌
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-fg truncate">{user.name}</div>
              <div className="text-meta text-muted truncate">
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
