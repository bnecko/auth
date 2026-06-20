import { CircleHelp, ShieldCheck, Boxes } from "lucide-react";
import { Section } from "@/components/Section";

export const dynamic = "force-dynamic";

function QA({ q, a }: { q: string; a: string }) {
  return (
    <div className="px-4 py-3.5 border-t border-rule first:border-t-0">
      <div className="text-[14px] font-medium text-fg mb-1">{q}</div>
      <div className="text-[13px] text-secondary leading-relaxed">{a}</div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">FAQ</h1>
        <p className="text-[13px] text-muted">Answers to common questions</p>
      </header>

      <Section title="Account" icon={CircleHelp}>
        <QA
          q="How do I create an account?"
          a="Choose Create account on the sign-in page, fill in your details, and confirm with Telegram to finish."
        />
        <QA
          q="Where do I update my profile?"
          a="Open Profile in the sidebar to edit your name, bio, and the details you share with connected apps."
        />
        <QA
          q="How do I sign out everywhere?"
          a="Go to Sessions and choose Revoke others to end every session except the one you are using."
        />
      </Section>

      <Section title="Security" icon={ShieldCheck}>
        <QA
          q="What is Telegram 2FA?"
          a="When you sign in, we send an approval prompt to your linked Telegram. A login only completes after you approve it there, so a stolen password is not enough."
        />
        <QA
          q="What are passkeys?"
          a="Passkeys let you sign in without a password using your device biometrics or a security key. Add one under Password & 2FA."
        />
        <QA
          q="I lost access to my Telegram — what now?"
          a="Contact support to recover your account. You will be asked to verify your identity before any change is made."
        />
      </Section>

      <Section title="Developers" icon={Boxes}>
        <QA
          q="How do I connect an app with OAuth?"
          a="Register an app under Developer → OAuth apps, then use the authorization and token endpoints. The OAuth docs page has the full reference and a test lab."
        />
        <QA
          q="What is an API bearer token?"
          a="A long-lived token for server-to-server access. Request one under API bearers; an admin reviews each request before it is issued."
        />
      </Section>
    </>
  );
}
