import Link from "next/link";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PasskeyManager } from "@/components/PasskeyManager";
import { ChangePasswordForm } from "@/components/ChangePasswordForm";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { getCurrentSession } from "@/lib/server/session";
import { findWebauthnCredentialsByUser } from "@/lib/server/repositories/webauthn";
import { changePasswordAction } from "./actions";

export const dynamic = "force-dynamic";

function shortDate(value: string | null) {
  return value ? value.slice(0, 10) : "never";
}

export default async function SecurityPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;
  const passkeys = await findWebauthnCredentialsByUser(u.id);
  const hasTelegram = !!u.telegramVerifiedAt;

  return (
    <AppShell
      user={{ name: u.firstName, username: u.username }}
      trail="Password & 2FA"
      isAdmin={u.role === "admin"}
    >
      <header data-mount-row className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Password & 2FA</h1>
        <p className="text-[13px] text-muted">Authentication and account recovery</p>
      </header>

      <Section title="Password" hint="Rotate your account password">
        <ChangePasswordForm action={changePasswordAction} />
      </Section>

      <Section title="Telegram 2FA" hint="Linked recovery channel">
        <Row>
          <RowLabel>Status</RowLabel>
          <RowValue>
            {hasTelegram ? (
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-ok" />
                <span>Enabled {shortDate(u.telegramVerifiedAt)}</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-accent" />
                <span className="text-accent-strong">Not linked</span>
              </span>
            )}
          </RowValue>
          <Link href="/relink" className="text-[13px] text-secondary hover:text-accent-strong transition-colors">
            Relink
          </Link>
        </Row>
      </Section>

      <Section title="Passkeys" hint="Passwordless credentials">
        <PasskeyManager
          passkeys={passkeys.map(item => ({
            id: item.credentialId,
            name: item.name || "Unknown Device",
            lastUsed: item.lastUsedAt,
          }))}
        />
      </Section>
    </AppShell>
  );
}
