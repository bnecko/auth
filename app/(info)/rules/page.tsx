import type { Metadata } from "next";
import Link from "next/link";
import { DocHeader, DocSection, DocList } from "@/components/Doc";
import { TERMS_EFFECTIVE } from "@/lib/server/terms";

export const metadata: Metadata = {
  title: "Rules — bottleneck",
  description: "Acceptable use rules for the bottleneck account service.",
};

export default function RulesPage() {
  return (
    <article>
      <DocHeader title="Rules" subtitle={`Acceptable use · effective ${TERMS_EFFECTIVE}`} />

      <DocSection heading="The short version">
        <p>
          bottleneck is an account and sign-in service. Use it for your own legitimate access,
          treat other people fairly, and do not attack the service or the people who rely on it.
          Breaking these rules can cost you your account.
        </p>
      </DocSection>

      <DocSection heading="Give accurate information">
        <DocList
          items={[
            "Register with details that are accurate and your own. Provide a valid, truthful date of birth - a fake, placeholder, or knowingly incorrect date of birth is a violation.",
            "Do not impersonate another person, organization, or service, and do not create an account on someone else's behalf without their permission.",
            "Keep your contact details current so we can reach you about security events affecting your account.",
          ]}
        />
      </DocSection>

      <DocSection heading="Do not exploit or abuse the service">
        <DocList
          items={[
            "Do not probe for, exploit, or take advantage of vulnerabilities, bugs, or misconfigurations except as part of a good-faith report (see Security research below).",
            "Do not circumvent or attempt to defeat security controls - this includes two-factor approval, rate limits, account suspensions, and bans.",
            "Do not access, or try to access, accounts, tokens, or data that are not yours.",
            "Do not automate abuse: credential stuffing, mass or scripted account creation, scraping, or flooding endpoints.",
            "Do not use OAuth apps, API keys, bearer tokens, webhooks, or any other feature in a way that exceeds what you were granted or that harms the platform or its users.",
          ]}
        />
      </DocSection>

      <DocSection heading="Do not harm other people">
        <DocList
          items={[
            "No harassment, threats, stalking, or hate directed at others.",
            "No doxxing or publishing someone's private information without consent.",
            "No spam, phishing, malware, or fraud, including using a connected app or support channel to deceive or exploit other users.",
            "No content or conduct that is illegal where you or the people you affect are located.",
          ]}
        />
      </DocSection>

      <DocSection heading="Consequences">
        <p>
          Violating these rules - including providing an invalid date of birth, or exploiting or
          abusing the service or other people through it - may result in immediate{" "}
          <strong className="text-fg">suspension and/or a permanent ban</strong>, at our discretion
          and without prior notice. Where appropriate we may also remove content, revoke issued
          tokens, and report conduct to the relevant authorities.
        </p>
        <p>
          Bans can be enforced by your linked Telegram identity, so a ban can survive deleting and
          recreating an account. Evading a ban is itself a violation.
        </p>
      </DocSection>

      <DocSection heading="Security research">
        <p>
          We welcome good-faith security research. If you find a vulnerability, report it privately
          rather than exploiting it or disclosing it publicly, and give us reasonable time to fix
          it. Good-faith research that follows the disclosure process in our security policy will
          not be penalized under these rules. You can reach us through{" "}
          <Link href="/support" className="text-accent-strong transition-colors hover:text-fg">
            support
          </Link>
          .
        </p>
      </DocSection>

      <DocSection heading="Related">
        <p>
          These Rules are part of the{" "}
          <Link href="/terms" className="text-accent-strong transition-colors hover:text-fg">
            Terms of Service
          </Link>
          . See also the{" "}
          <Link href="/privacy" className="text-accent-strong transition-colors hover:text-fg">
            Privacy Policy
          </Link>
          .
        </p>
      </DocSection>
    </article>
  );
}
