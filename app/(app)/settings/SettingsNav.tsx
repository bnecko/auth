"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const sections = [
  { href: "/settings/profile", label: "Profile" },
  { href: "/settings/security", label: "Password & 2FA" },
  { href: "/settings/sessions", label: "Sessions" },
  { href: "/settings/activity", label: "Activity" },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="mb-7 -mx-1 flex gap-1 overflow-x-auto border-b border-rule pb-px">
      {sections.map(s => {
        const active = pathname === s.href || pathname.startsWith(`${s.href}/`);
        return (
          <Link
            key={s.href}
            href={s.href}
            className={`shrink-0 px-3 h-9 inline-flex items-center text-[13px] border-b-2 -mb-px transition-colors ${
              active
                ? "border-accent text-fg font-medium"
                : "border-transparent text-secondary hover:text-fg"
            }`}
          >
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}
