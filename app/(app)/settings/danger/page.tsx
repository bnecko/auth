import { redirect } from "next/navigation";
import { Download, PauseCircle, TriangleAlert } from "lucide-react";
import { Section, Row, RowLabel, RowValue } from "@/components/Section";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { getCurrentSession } from "@/lib/server/session";
import { deactivateAccountAction } from "./actions";
import { DeleteAccountFlow } from "./DeleteAccountFlow";

export const dynamic = "force-dynamic";

export default async function DangerZonePage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Danger zone</h1>
        <p className="text-[13px] text-muted">Export, pause, or close your account</p>
      </header>

      <Section title="Export your data" icon={Download} hint="A JSON copy of your account">
        <Row>
          <RowLabel>Account data</RowLabel>
          <RowValue>
            <span className="text-secondary">
              Profile, preferences, sessions, recent activity, subscriptions, and connected
              apps.
            </span>
          </RowValue>
          <a href="/api/account/export">
            <Button variant="secondary" size="sm">
              Download
            </Button>
          </a>
        </Row>
      </Section>

      <Section title="Deactivate" icon={PauseCircle} hint="Reversible - sign back in to restore">
        <Row>
          <RowLabel>Deactivate account</RowLabel>
          <RowValue>
            <span className="text-secondary">
              Hides your account and signs you out everywhere. Signing back in restores it with
              no data loss.
            </span>
          </RowValue>
          <ConfirmButton
            action={deactivateAccountAction}
            label="Deactivate"
            triggerVariant="secondary"
            tone="warning"
            title="Deactivate your account?"
            message="You'll be signed out on every device. Your account is hidden until you sign in again - nothing is deleted."
            confirmLabel="Deactivate"
          />
        </Row>
      </Section>

      <Section title="Delete" icon={TriangleAlert} hint="Permanent after a 30-day grace period">
        <DeleteAccountFlow hasTelegram={!!current.user.telegramId} />
      </Section>
    </>
  );
}
