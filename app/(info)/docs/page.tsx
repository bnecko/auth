import type { Metadata } from "next";
import Link from "next/link";
import { DocHeader, DocSection, DocList } from "@/components/Doc";

export const metadata: Metadata = {
  title: "Documentation — bottleneck",
  description:
    "Get started with bottleneck: Telegram-confirmed sign-in, passkeys, and an OAuth 2.1 / OpenID Connect provider.",
};

export default function DocsPage() {
  return (
    <article>
      <DocHeader title="Documentation" subtitle="Get started and integrate with bottleneck" />

      <DocSection heading="What bottleneck is">
        <p>
          bottleneck is an account service with Telegram-confirmed two-factor sign-in and passkeys,
          and a full OAuth 2.1 / OpenID Connect provider you can use to sign users into your own
          applications.
        </p>
      </DocSection>

      <DocSection heading="Getting started">
        <DocList
          items={[
            <>
              <Link href="/register" className="text-accent-strong transition-colors hover:text-fg">
                Create an account
              </Link>{" "}
              and confirm it from Telegram to finish sign-up.
            </>,
            "Add a passkey under Password & 2FA to sign in without a password.",
            "Each sign-in is approved from your linked Telegram, so a stolen password alone is not enough.",
          ]}
        />
      </DocSection>

      <DocSection heading="For developers">
        <p>
          bottleneck implements OAuth 2.1 and OpenID Connect. Client metadata is published at the
          standard discovery endpoint:
        </p>
        <p>
          <code className="text-[13px] text-accent-strong">/.well-known/openid-configuration</code>
        </p>
        <DocList
          items={[
            "Register an application from the developer dashboard to obtain a client ID and client secret.",
            "Use the authorization, token, and userinfo endpoints listed in the discovery document; PKCE is required.",
            "Request only the scopes your app needs (for example openid, profile, email). Users approve scopes on a consent screen.",
          ]}
        />
      </DocSection>

      <DocSection heading="API bearer tokens">
        <p>
          For server-to-server access you can request a long-lived API bearer token. Each request is
          reviewed before a token is issued. API keys and OAuth client secrets are separate
          credentials — keep both confidential and rotate them if exposed.
        </p>
      </DocSection>

      <DocSection heading="SDKs">
        <p>
          Official client libraries are available for Node.js and Go to verify tokens and call the
          API. See the SDK directories in the project for usage.
        </p>
      </DocSection>

      <DocSection heading="More">
        <p>
          Browse the{" "}
          <Link href="/faq" className="text-accent-strong transition-colors hover:text-fg">
            FAQ
          </Link>{" "}
          for common questions, or reach{" "}
          <Link href="/support" className="text-accent-strong transition-colors hover:text-fg">
            support
          </Link>{" "}
          if you are stuck.
        </p>
      </DocSection>
    </article>
  );
}
