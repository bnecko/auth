"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// `hard` forces a full page load instead of a client-side transition. A soft
// navigation keeps the Content-Security-Policy of whichever document loaded
// first, and the TON wallet page is the only one granted the wallet bridge
// origins in connect-src, so reaching it from another tab would leave it
// unable to talk to any wallet.
const sections = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Password & 2FA" },
  { href: "/settings/sessions", label: "Sessions" },
  { href: "/settings/activity", label: "Activity" },
  { href: "/settings/notifications", label: "Notifications" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/ton", label: "TON wallet", hard: true },
  { href: "/settings/danger", label: "Danger zone" },
];

export function SettingsNav({ cryptoEnabled }: { cryptoEnabled: boolean }) {
  const pathname = usePathname();
  const visible = cryptoEnabled ? sections : sections.filter(s => s.href !== "/settings/ton");
  return (
    <nav className="mb-7 -mx-1 flex gap-1 overflow-x-auto border-b border-rule pb-px">
      {visible.map(s => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        const className = `shrink-0 px-3 h-9 inline-flex items-center text-[13px] border-b-2 -mb-px transition-colors ${
          active
            ? "border-accent text-fg font-medium"
            : "border-transparent text-secondary hover:text-fg"
        }`;
        return s.hard ? (
          <a key={s.href} href={s.href} className={className}>
            {s.label}
          </a>
        ) : (
          <Link key={s.href} href={s.href} className={className}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
