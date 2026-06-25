import type { Metadata } from "next";
import Link from "next/link";
import { DocHeader, DocSection, DocList } from "@/components/Doc";
import { TERMS_EFFECTIVE } from "@/lib/server/terms";

export const metadata: Metadata = {
  title: "Terms of Service — bottleneck",
  description: "The terms that govern your use of the bottleneck account service.",
};

export default function TermsPage() {
  return (
    <article>
      <DocHeader title="Terms of Service" subtitle={`Effective ${TERMS_EFFECTIVE}`} />

      <DocSection heading="1. Acceptance">
        <p>
          These Terms of Service govern your access to and use of bottleneck (the &ldquo;Service&rdquo;).
          By creating an account or using the Service you agree to these Terms, the{" "}
          <Link href="/privacy" className="text-accent-strong transition-colors hover:text-fg">
            Privacy Policy
          </Link>
          , and the{" "}
          <Link href="/rules" className="text-accent-strong transition-colors hover:text-fg">
            Rules
          </Link>
          , which are incorporated here by reference. If you do not agree, do not use the Service.
        </p>
      </DocSection>

      <DocSection heading="2. Eligibility">
        <p>
          You must be old enough to form a binding agreement where you live and able to use the
          Service under applicable law. You must provide accurate registration details, including a
          valid date of birth.
        </p>
      </DocSection>

      <DocSection heading="3. Your account">
        <DocList
          items={[
            "You are responsible for activity under your account. Keep your password, passkeys, and linked Telegram account secure.",
            "Two-factor approval and other security features are part of the Service; do not disable or circumvent them improperly.",
            "Notify us promptly if you believe your account or credentials have been compromised.",
          ]}
        />
      </DocSection>

      <DocSection heading="4. Acceptable use">
        <p>
          Your use of the Service is subject to the{" "}
          <Link href="/rules" className="text-accent-strong transition-colors hover:text-fg">
            Rules
          </Link>
          . In short: provide accurate information, do not exploit or abuse the Service, and do not
          use it to harm other people. We may suspend or terminate accounts that violate the Rules.
        </p>
      </DocSection>

      <DocSection heading="5. Developers and connected apps">
        <DocList
          items={[
            "If you register an OAuth client or request API credentials, you are responsible for keeping client secrets, API keys, and tokens confidential and for the behavior of your application.",
            "Only request the scopes your application needs, and handle any user data you receive in line with your own privacy obligations and the consent the user granted.",
            "We may revoke credentials or disable a client that abuses the Service or its users.",
          ]}
        />
      </DocSection>

      <DocSection heading="6. Suspension and termination">
        <p>
          We may suspend or terminate your access at any time for violations of these Terms or the
          Rules, to protect the Service or its users, or as required by law. You may stop using the
          Service and delete your account at any time from your account settings.
        </p>
      </DocSection>

      <DocSection heading="7. Service provided “as is”">
        <p>
          The Service is provided on an &ldquo;as is&rdquo; and &ldquo;as available&rdquo; basis
          without warranties of any kind, to the fullest extent permitted by law. We do not warrant
          that the Service will be uninterrupted, error-free, or secure against every threat.
        </p>
      </DocSection>

      <DocSection heading="8. Limitation of liability">
        <p>
          To the fullest extent permitted by law, we are not liable for any indirect, incidental,
          or consequential damages, or for loss of data, arising from your use of or inability to
          use the Service.
        </p>
      </DocSection>

      <DocSection heading="9. Changes to these Terms">
        <p>
          We may update these Terms. When we make material changes we will revise the version and
          effective date shown here; continuing to use the Service after a change means you accept
          the updated Terms.
        </p>
      </DocSection>

      <DocSection heading="10. Contact">
        <p>
          Questions about these Terms can be raised through{" "}
          <Link href="/support" className="text-accent-strong transition-colors hover:text-fg">
            support
          </Link>
          .
        </p>
      </DocSection>
    </article>
  );
}
