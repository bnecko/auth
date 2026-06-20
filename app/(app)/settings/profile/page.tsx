import { redirect } from "next/navigation";
import Link from "next/link";
import { User, ExternalLink } from "lucide-react";
import { Button } from "@/components/Button";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Alert } from "@/components/Alert";
import { getCurrentSession } from "@/lib/server/session";
import { listPendingProfileChangesForUser } from "@/lib/server/repositories/profileChanges";
import { telegramPublicRef } from "@/lib/server/telegramRef";
import { ProfileEditForm, IdentityChangeForm } from "./ProfileEditForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const pending = await listPendingProfileChangesForUser(u.id);
  const hasTelegram = !!u.telegramId;
  const ref = telegramPublicRef(u.telegramId);

  return (
    <>
      <header className="mb-6 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Profile</h1>
          <p className="text-[13px] text-muted">Your account details</p>
        </div>
        <Link href={`/u/${u.publicId}`} target="_blank" rel="noreferrer">
          <Button variant="ghost" size="sm">
            View public profile <ExternalLink size={13} />
          </Button>
        </Link>
      </header>

      {pending.length > 0 && (
        <div className="mb-5">
          <Alert tone="warning">
            Pending Telegram approval:{" "}
            {pending.map(p => `${p.field} -> ${p.newValue}`).join(", ")}. Approve in Telegram to
            apply.
          </Alert>
        </div>
      )}

      <Section title="Profile" icon={User} hint="Name, bio, and avatar">
        <ProfileEditForm
          publicId={u.publicId}
          firstName={u.firstName}
          bio={u.bio}
          avatarPreset={u.avatarPreset}
        />
      </Section>

      <Section title="Username" hint="Public handle">
        <IdentityChangeForm field="username" current={`@${u.username}`} hasTelegram={hasTelegram} />
      </Section>

      <Section title="Email" hint="Private - sign-in identifier">
        <IdentityChangeForm field="email" current={u.email} hasTelegram={hasTelegram} />
      </Section>

      <Section title="Other" hint="Managed elsewhere">
        <Row>
          <RowLabel>Date of birth</RowLabel>
          <RowValue privateField>{u.dob || "Not set"}</RowValue>
          <span />
        </Row>
        <Row>
          <RowLabel>Telegram</RowLabel>
          <RowValue>
            {u.telegramUsername ? `@${u.telegramUsername}` : u.telegramId || "Not linked"}
            {ref && <span className="text-faint ml-2">ref {ref}</span>}
          </RowValue>
          <Link href="/relink">
            <Button variant="secondary" size="sm">
              Relink
            </Button>
          </Link>
        </Row>
        {hasTelegram && (
          <Row>
            <RowLabel>2FA</RowLabel>
            <RowValue>
              <Tag tone="success">Telegram verified</Tag>
            </RowValue>
            <span />
          </Row>
        )}
      </Section>
    </>
  );
}
