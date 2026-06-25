import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  Send,
  Fingerprint,
  Boxes,
  MonitorSmartphone,
  SlidersHorizontal,
  Terminal,
  ArrowRight,
  Lock,
  ShieldCheck,
  Zap,
  KeyRound,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/Button";
import { CodeBlock } from "@/components/landing/CodeBlock";
import { getCurrentSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Bottleneck — authentication, approved from Telegram",
  description:
    "Telegram-confirmed two-factor sign-in, passkeys, and a full OAuth 2.1 / OpenID Connect provider for your app.",
};

function Monogram({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" aria-hidden="true" className="shrink-0">
      <path d="M3 1 V7 L8 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M17 1 V7 L12 12 V19" stroke="var(--accent)" strokeWidth="1.5" />
      <path d="M8 12 H12" stroke="var(--accent)" strokeWidth="1.5" />
    </svg>
  );
}

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Send,
    title: "Telegram two-factor",
    body: "After the password, users get a Log in / Not me prompt in Telegram. Tap to approve, then a 6-digit code confirms it's really them.",
  },
  {
    icon: Fingerprint,
    title: "Passkeys",
    body: "Passwordless WebAuthn sign-in with Face ID, Touch ID, or a hardware key — no shared secret left to phish.",
  },
  {
    icon: Boxes,
    title: "OAuth & OIDC provider",
    body: "Be the identity provider for your own apps: Authorization Code + PKCE, refresh tokens, discovery and JWKS out of the box.",
  },
  {
    icon: MonitorSmartphone,
    title: "Sessions you control",
    body: "Device-aware sessions with one-tap revoke, idle timeouts, and a full security-event trail.",
  },
  {
    icon: SlidersHorizontal,
    title: "Self-serve accounts",
    body: "Profile, privacy controls, data export, deactivate, and grace-period delete — all handled by the user.",
  },
  {
    icon: Terminal,
    title: "A real SDK",
    body: "A typed Node SDK for the activation broker and the OAuth flow. Install it, point it at your issuer, ship.",
  },
];

const GUARANTEES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Lock,
    title: "Identity-level bans",
    body: "Ban by Telegram identity, so a recreated account with a fresh email stays blocked.",
  },
  {
    icon: ShieldCheck,
    title: "Real revocation",
    body: "A ban kills sessions and OAuth tokens immediately — nothing lingers until expiry.",
  },
  {
    icon: Zap,
    title: "Rate-limited everywhere",
    body: "Login, registration, and recovery are throttled per IP and per account.",
  },
  {
    icon: KeyRound,
    title: "Step-up on risky moves",
    body: "Password changes and account deletion need Telegram approval and your current password.",
  },
];

const SDK_CODE = `import { BottleneckAuthClient } from "@bottleneck/auth-sdk";

const auth = new BottleneckAuthClient({
  issuer: "https://auth.bneck.com",
});

// Ask Bottleneck to authenticate a user, then poll for the result.
const req = await auth.createActivationRequest({
  apiKey: process.env.BOTTLENECK_AUTH_API_KEY!,
  requestedSubject: "user-42",
  scopes: ["profile:read", "email:read"],
  returnUrl: "https://app.example.com/auth/return",
});

// Send them to req.activationUrl, then read the approved profile:
const { status, profile } = await auth.getActivationStatus({
  apiKey: process.env.BOTTLENECK_AUTH_API_KEY!,
  id: req.id,
});

if (status === "approved") {
  console.log(profile.id, profile.email);
}`;

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 text-[12px] font-medium tracking-wide uppercase text-accent-strong">
      <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

export default async function LandingPage() {
  const current = await getCurrentSession();
  if (current) redirect("/account");

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-fg">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-rule bg-canvas/80 backdrop-blur-sm">
        <div className="mx-auto w-full max-w-[1080px] px-6 h-14 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 select-none">
            <Monogram />
            <span className="text-[16px] font-semibold tracking-tight">bottleneck</span>
          </Link>
          <nav className="flex items-center gap-1.5">
            <Link
              href="/docs"
              className="hidden sm:inline-flex h-8 px-3 items-center rounded-md text-[13px] text-secondary hover:text-fg transition-colors"
            >
              Docs
            </Link>
            <Link
              href="/support"
              className="hidden sm:inline-flex h-8 px-3 items-center rounded-md text-[13px] text-secondary hover:text-fg transition-colors"
            >
              Support
            </Link>
            <Link href="/login">
              <Button variant="ghost" size="sm">
                Sign in
              </Button>
            </Link>
            <Link href="/register">
              <Button size="sm">Create account</Button>
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-[1080px] px-6 pt-20 pb-16 text-center">
        <div className="mb-5 flex justify-center">
          <Eyebrow>Telegram-native auth · passkeys · OAuth 2.1</Eyebrow>
        </div>
        <h1 className="mx-auto max-w-[760px] text-[40px] sm:text-[54px] lg:text-[62px] font-semibold tracking-tight leading-[1.05]">
          Authentication, approved from Telegram.
        </h1>
        <p className="mx-auto mt-6 max-w-[600px] text-[16px] sm:text-[17px] text-secondary leading-relaxed">
          Bottleneck gives your app Telegram-confirmed two-factor sign-in, passkeys, and a
          complete OAuth 2.1 / OpenID Connect provider — so logging in is a tap your users
          trust, not a password they reuse.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register">
            <Button>
              Create account <ArrowRight size={15} />
            </Button>
          </Link>
          <Link href="/docs">
            <Button variant="secondary">Read the docs</Button>
          </Link>
        </div>
        <p className="mt-6 text-[12.5px] text-muted">
          Passkeys · Telegram 2FA · OAuth 2.1 + PKCE · OIDC discovery
        </p>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-[1080px] px-6 py-16">
        <div className="max-w-[640px] mb-10">
          <Eyebrow>What you get</Eyebrow>
          <h2 className="mt-3 text-[28px] sm:text-[34px] font-semibold tracking-tight leading-tight">
            Everything sign-in needs, nothing it doesn&apos;t.
          </h2>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(f => {
            const Icon = f.icon;
            return (
              <div
                key={f.title}
                className="rounded-xl border border-rule bg-card p-5 shadow-xs"
              >
                <span className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-elevated border border-rule mb-4">
                  <Icon size={17} className="text-accent-strong" />
                </span>
                <h3 className="text-[15px] font-medium text-fg mb-1.5">{f.title}</h3>
                <p className="text-[13.5px] text-secondary leading-relaxed">{f.body}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* SDK */}
      <section className="mx-auto w-full max-w-[1080px] px-6 py-16">
        <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
          <div>
            <Eyebrow>Developer SDK</Eyebrow>
            <h2 className="mt-3 text-[28px] sm:text-[34px] font-semibold tracking-tight leading-tight">
              Wire it up in a few lines.
            </h2>
            <p className="mt-4 text-[15px] text-secondary leading-relaxed max-w-[460px]">
              Point the client at your issuer and let Bottleneck run the sign-in. Poll for the
              result and read the approved profile — scopes the user declines come back null.
            </p>
            <Link
              href="/docs"
              className="mt-5 inline-flex items-center gap-1.5 text-[14px] text-accent-strong hover:text-fg transition-colors"
            >
              Read the SDK docs <ArrowRight size={14} />
            </Link>
          </div>
          <CodeBlock label="server.ts" code={SDK_CODE} />
        </div>
      </section>

      {/* Security band */}
      <section className="bg-fg text-bg">
        <div className="mx-auto w-full max-w-[1080px] px-6 py-16">
          <div className="max-w-[640px] mb-10">
            <span className="inline-flex items-center gap-2 text-[12px] font-medium tracking-wide uppercase text-accent">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-accent" />
              Secure by default
            </span>
            <h2 className="mt-3 text-[28px] sm:text-[34px] font-semibold tracking-tight leading-tight">
              Bans that actually ban.
            </h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {GUARANTEES.map(g => {
              const Icon = g.icon;
              return (
                <div key={g.title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                  <Icon size={18} className="text-accent mb-4" />
                  <h3 className="text-[14px] font-medium text-bg mb-1.5">{g.title}</h3>
                  <p className="text-[13px] text-bg/60 leading-relaxed">{g.body}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-[1080px] px-6 py-20 text-center">
        <h2 className="mx-auto max-w-[560px] text-[30px] sm:text-[40px] font-semibold tracking-tight leading-[1.1]">
          Sign-in your users trust — in an afternoon.
        </h2>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link href="/register">
            <Button>
              Create account <ArrowRight size={15} />
            </Button>
          </Link>
          <Link href="/login">
            <Button variant="secondary">Sign in</Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-rule">
        <div className="mx-auto w-full max-w-[1080px] px-6 py-12 grid gap-10 sm:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <div>
            <Link href="/" className="flex items-center gap-2 select-none mb-3">
              <Monogram size={20} />
              <span className="text-[15px] font-semibold tracking-tight">bottleneck</span>
            </Link>
            <p className="text-[13px] text-muted max-w-[280px] leading-relaxed">
              Telegram-confirmed authentication, passkeys, and an OAuth 2.1 provider for your
              app.
            </p>
          </div>
          <div>
            <div className="text-[12px] font-medium uppercase tracking-wider text-faint mb-3">
              Product
            </div>
            <ul className="space-y-2 text-[13px]">
              <li><Link href="/register" className="text-secondary hover:text-fg transition-colors">Create account</Link></li>
              <li><Link href="/login" className="text-secondary hover:text-fg transition-colors">Sign in</Link></li>
              <li><Link href="/docs" className="text-secondary hover:text-fg transition-colors">Documentation</Link></li>
            </ul>
          </div>
          <div>
            <div className="text-[12px] font-medium uppercase tracking-wider text-faint mb-3">
              Support
            </div>
            <ul className="space-y-2 text-[13px]">
              <li><Link href="/support" className="text-secondary hover:text-fg transition-colors">Community support</Link></li>
              <li><Link href="/faq" className="text-secondary hover:text-fg transition-colors">FAQ</Link></li>
              <li>
                <a
                  href="https://t.me/bottleneck_help"
                  target="_blank"
                  rel="noreferrer"
                  className="text-secondary hover:text-fg transition-colors"
                >
                  Telegram
                </a>
              </li>
            </ul>
          </div>
          <div>
            <div className="text-[12px] font-medium uppercase tracking-wider text-faint mb-3">
              Legal
            </div>
            <ul className="space-y-2 text-[13px]">
              <li><Link href="/terms" className="text-secondary hover:text-fg transition-colors">Terms of Service</Link></li>
              <li><Link href="/privacy" className="text-secondary hover:text-fg transition-colors">Privacy Policy</Link></li>
              <li><Link href="/rules" className="text-secondary hover:text-fg transition-colors">Rules</Link></li>
            </ul>
          </div>
        </div>
        <div className="mx-auto w-full max-w-[1080px] px-6 pb-10 text-[12px] text-faint">
          bottleneck · {new Date().getFullYear()}
        </div>
      </footer>
    </div>
  );
}
