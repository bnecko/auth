import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { getCurrentSession } from "@/lib/server/session";
import { canHandleSecurity, canRestrict } from "@/lib/server/supporterAuth";
import { listReviewQueue, listRestrictions } from "@/lib/server/services/restrictions";
import { Section, Empty } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { ConfirmButton } from "@/components/ConfirmButton";
import {
  dismissSuspicionAction,
  restrictFromQueueAction,
  restrictManualAction,
} from "./actions";

export const dynamic = "force-dynamic";

export default async function SecurityReviewPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!(await canHandleSecurity(current.user))) redirect("/");
  const mayRestrict = await canRestrict(current.user);

  const [queue, restrictions] = await Promise.all([listReviewQueue(), listRestrictions()]);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-1">Security review</h1>
        <p className="text-[13px] text-muted">
          Flagged accounts and active restrictions.
          {!mayRestrict && " You can view and chat; only high-security can restrict."}
        </p>
      </header>

      {mayRestrict && (
        <Section title="Restrict an account" icon={ShieldAlert} hint="manual">
          <div className="px-4 py-3">
            <ConfirmButton
              action={restrictManualAction}
              extraInput={{
                name: "username",
                label: "Username or email",
                placeholder: "username",
                required: true,
              }}
              label="Restrict an account"
              triggerVariant="danger"
              tone="danger"
              title="Restrict this account?"
              message="They are signed out everywhere and can only reach the security conversation until reviewed."
              confirmLabel="Restrict"
            />
          </div>
        </Section>
      )}

      <Section title="Review queue" hint={`${queue.length} pending`}>
        {queue.length === 0 ? (
          <Empty>Nothing flagged</Empty>
        ) : (
          queue.map(s => (
            <div
              key={s.publicId}
              className="border-t border-rule first:border-t-0 px-4 py-3 text-[13px]"
            >
              <div className="flex items-center gap-2 mb-1">
                <Tag tone="warning">{s.triggerType}</Tag>
                <span className="text-fg">{s.username ? `@${s.username}` : "unknown user"}</span>
                <span className="text-faint tabular-nums">score {s.score}</span>
                <span className="ml-auto text-faint tabular-nums">
                  {s.createdAt.slice(0, 10)}
                </span>
              </div>
              {s.reasons.length > 0 && (
                <div className="text-muted mb-2">{s.reasons.join(", ")}</div>
              )}
              <div className="flex items-center gap-2">
                {mayRestrict && s.userId && (
                  <ConfirmButton
                    action={restrictFromQueueAction}
                    fields={{ suspicionId: s.publicId, userId: s.userId, triggerType: s.triggerType }}
                    extraInput={{ name: "reason", label: "Reason (optional)", multiline: true }}
                    label="Restrict"
                    triggerVariant="danger"
                    tone="danger"
                    title="Restrict this account?"
                    message="They are signed out everywhere and limited to the security conversation."
                    confirmLabel="Restrict"
                  />
                )}
                <ConfirmButton
                  action={dismissSuspicionAction}
                  fields={{ suspicionId: s.publicId }}
                  label="Dismiss"
                  triggerVariant="secondary"
                  tone="warning"
                  title="Dismiss this flag?"
                  message="It is removed from the review queue."
                  confirmLabel="Dismiss"
                />
              </div>
            </div>
          ))
        )}
      </Section>

      <Section title="Active restrictions" hint={`${restrictions.length}`}>
        {restrictions.length === 0 ? (
          <Empty>No active restrictions</Empty>
        ) : (
          restrictions.map(r => (
            <Link
              key={r.publicId}
              href={`/security-review/${r.publicId}`}
              className="flex items-center gap-2 px-4 py-3 border-t border-rule first:border-t-0 text-[13px] hover:bg-hover transition-colors"
            >
              <Tag tone="danger">{r.triggerType}</Tag>
              <span className="text-fg">@{r.username}</span>
              <code className="text-[12px] text-muted">{r.triggerCode}</code>
              <span className="ml-auto text-faint tabular-nums">{r.createdAt.slice(0, 10)}</span>
            </Link>
          ))
        )}
      </Section>
    </>
  );
}
