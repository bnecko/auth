import { Section, Empty } from "@/components/Section";
import { ConfirmButton } from "@/components/ConfirmButton";
import { listSupporters } from "@/lib/server/services/support";
import { addSupporterAction, removeSupporterAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminSupportersPage() {
  const supporters = await listSupporters();

  return (
    <>
      <header className="mb-10">
        <p className="text-[13px] text-muted mb-2">Admin / Support</p>
        <h1 className="text-[32px] tracking-tight text-fg leading-none">
          Supporters
        </h1>
      </header>

      <Section title="Add supporter" hint="grants supporter access">
        <div className="px-4 py-3">
          <ConfirmButton
            action={addSupporterAction}
            extraInput={{
              name: "username",
              label: "Username or email",
              placeholder: "username or email",
              required: true,
            }}
            label="Add supporter"
            triggerVariant="primary"
            tone="neutral"
            title="Add a supporter?"
            message="This grants the account supporter access: viewing private threads, replying, and claiming tickets."
            confirmLabel="Add supporter"
          />
        </div>
      </Section>

      <Section title="Roster" hint={`${supporters.length}`}>
        {supporters.length === 0 ? (
          <Empty>No supporters yet</Empty>
        ) : (
          supporters.map(s => (
            <div
              key={s.userId}
              className="flex items-center justify-between gap-3 px-4 py-3 border-t border-rule first:border-t-0 text-[13px]"
            >
              <div className="min-w-0">
                <div className="text-fg truncate">
                  {s.firstName} <span className="text-muted">@{s.username}</span>
                </div>
                <div className="text-[12px] text-muted">
                  added {s.createdAt.slice(0, 10)}
                </div>
              </div>
              <ConfirmButton
                action={removeSupporterAction}
                fields={{ userId: s.userId }}
                label="Remove"
                triggerVariant="danger"
                tone="danger"
                title={`Remove @${s.username} as supporter?`}
                message="They will lose supporter access to private threads and the queue."
                confirmLabel="Remove supporter"
              />
            </div>
          ))
        )}
      </Section>
    </>
  );
}
