import { redirect } from "next/navigation";
import Link from "next/link";
import { Eye, ExternalLink } from "lucide-react";
import { Section } from "@/components/Section";
import { Button } from "@/components/Button";
import { getCurrentSession } from "@/lib/server/session";
import { SettingsToggleForm } from "../SettingsToggleForm";
import { updatePrivacyAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function PrivacyPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Privacy</h1>
          <p className="text-[13px] text-muted">Control what others can see about you</p>
        </div>
        {u.profilePublic && (
          <Link href={`/u/${u.publicId}`} target="_blank" rel="noreferrer">
            <Button variant="ghost" size="sm">
              View public profile <ExternalLink size={13} />
            </Button>
          </Link>
        )}
      </header>

      <Section title="Public profile" icon={Eye} hint="Your /u page and handle">
        <SettingsToggleForm
          action={updatePrivacyAction}
          toggles={[
            {
              name: "profilePublic",
              label: "Public profile",
              description:
                "Show your profile page at /u. When off, the page returns not-found for everyone.",
              defaultChecked: u.profilePublic,
            },
            {
              name: "discoverableByUsername",
              label: "Discoverable by username",
              description:
                "Let people reach your profile at /user/your-handle. When off, only the stable /u link works.",
              defaultChecked: u.discoverableByUsername,
            },
            {
              name: "publicShowTelegram",
              label: "Show Telegram on public profile",
              description:
                "Display your Telegram handle and reference code on your public profile.",
              defaultChecked: u.publicShowTelegram,
            },
          ]}
        />
      </Section>
    </>
  );
}
