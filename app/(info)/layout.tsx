import Link from "next/link";
import { TERMS_EFFECTIVE, TERMS_VERSION } from "@/lib/server/terms";

// Public chrome for the information pages. These are reachable without a
// session, so they carry their own header/footer rather than the app shell.

function Monogram() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M3 1 V7 L8 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M17 1 V7 L12 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M8 12 H12" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

const NAV = [
  { href: "/docs", label: "Docs" },
  { href: "/faq", label: "FAQ" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
  { href: "/rules", label: "Rules" },
];

export default function InfoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-canvas">
      <header className="border-b border-rule bg-card">
        <div className="mx-auto flex h-14 w-full max-w-[820px] items-center justify-between px-6">
          <Link href="/" className="flex select-none items-center gap-2">
            <Monogram />
            <span className="text-[15px] font-semibold tracking-tight text-fg">bottleneck</span>
          </Link>
          <nav className="flex items-center gap-4 text-[13px]">
            {NAV.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className="text-secondary transition-colors hover:text-fg"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[820px] flex-1 px-6 py-12">{children}</main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex w-full max-w-[820px] flex-wrap items-center justify-between gap-3 px-6 py-6 text-[12px] text-faint">
          <span>bottleneck · {new Date().getFullYear()}</span>
          <span>
            Terms version {TERMS_VERSION} · effective {TERMS_EFFECTIVE}
          </span>
        </div>
      </footer>
    </div>
  );
}
