import type { Metadata } from "next";
import Link from "next/link";
import { DocHeader, DocSection, DocList } from "@/components/Doc";
import { TERMS_EFFECTIVE } from "@/lib/server/terms";

export const metadata: Metadata = {
  title: "Privacy Policy — bottleneck",
  description: "How bottleneck collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <article>
      <DocHeader title="Privacy Policy" subtitle={`Effective ${TERMS_EFFECTIVE}`} />

      <DocSection heading="What we collect">
        <DocList
          items={[
            "Account details you provide: first name, username, optional bio, email address, and an optional date of birth.",
            "Authentication data: a hash of your password (never the password itself), registered passkeys, and your linked Telegram account id and username.",
            "Security and session data: IP address, user agent, approximate country, and sign-in and account-security events, used to protect your account.",
          ]}
        />
      </DocSection>

      <DocSection heading="How we use it">
        <DocList
          items={[
            "To create and operate your account and to sign you in.",
            "To provide two-factor approval and other security features, and to detect and prevent abuse.",
            "To notify you about security events affecting your account, where you have those notifications enabled.",
          ]}
        />
      </DocSection>

      <DocSection heading="Service providers">
        <p>We use a small number of processors to run the Service:</p>
        <DocList
          items={[
            "Telegram — to deliver two-factor approval prompts and to support Telegram-based sign-in.",
            "An email provider — to send verification and security codes to your email address.",
            "Cloudflare Turnstile — to protect sign-up and sign-in against automated abuse.",
          ]}
        />
      </DocSection>

      <DocSection heading="Sharing with connected apps">
        <p>
          When you authorize a third-party application through OAuth, we share only the information
          covered by the scopes you approve (for example your profile, email, or date of birth).
          We do not sell your personal data.
        </p>
      </DocSection>

      <DocSection heading="Retention">
        <p>
          We keep your account data for as long as your account exists. Security event records are
          retained for a limited period to investigate abuse. When you request deletion, your
          account enters a short grace period and is then permanently removed; some records may be
          retained where required for security or by law.
        </p>
      </DocSection>

      <DocSection heading="Your choices">
        <DocList
          items={[
            "Export your data or delete your account at any time from Settings → Danger zone.",
            "Deactivate your account to pause it; signing back in reactivates it.",
            "Control profile visibility and notification preferences in your settings.",
          ]}
        />
      </DocSection>

      <DocSection heading="Changes">
        <p>
          We may update this Privacy Policy. Material changes are reflected in the version and
          effective date shown here.
        </p>
      </DocSection>

      <DocSection heading="Contact">
        <p>
          For privacy questions, reach us through{" "}
          <Link href="/support" className="text-accent-strong transition-colors hover:text-fg">
            support
          </Link>
          . See also the{" "}
          <Link href="/terms" className="text-accent-strong transition-colors hover:text-fg">
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/rules" className="text-accent-strong transition-colors hover:text-fg">
            Rules
          </Link>
          .
        </p>
      </DocSection>
    </article>
  );
}
