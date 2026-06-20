import { redirect } from "next/navigation";
import { Bell, Send } from "lucide-react";
import { Section } from "@/components/Section";
import { Alert } from "@/components/Alert";
import { getCurrentSession } from "@/lib/server/session";
import { SettingsToggleForm } from "../SettingsToggleForm";
import { updateNotificationsAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  const u = current.user;

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Notifications</h1>
        <p className="text-[13px] text-muted">Optional Telegram alerts from your account</p>
      </header>

      {!u.telegramId && (
        <div className="mb-5">
          <Alert tone="info">
            These alerts are delivered over Telegram. Link Telegram to receive them.
          </Alert>
        </div>
      )}

      <Section title="Telegram alerts" icon={Bell} hint="What we message you about">
        <SettingsToggleForm
          action={updateNotificationsAction}
          toggles={[
            {
              name: "notifySecurityReceipts",
              label: "Security receipts",
              description:
                "Password changes, password resets, and unusual sign-in lockouts.",
              defaultChecked: u.notifySecurityReceipts,
            },
            {
              name: "notifySigninAlerts",
              label: "New sign-in alerts",
              description: "A heads-up when a passkey signs in to your account.",
              defaultChecked: u.notifySigninAlerts,
            },
          ]}
        />
      </Section>

      <Section title="Always on" icon={Send} hint="Sign-in approvals can't be turned off">
        <p className="px-4 py-4 text-[13px] text-muted">
          Two-factor approval prompts, login codes, account-change approvals, and password
          reset links are part of signing in and securing your account, so they are always
          sent.
        </p>
      </Section>
    </>
  );
}
