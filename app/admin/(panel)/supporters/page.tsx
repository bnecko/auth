import { Section, Empty } from "@/components/Section";
import { Button } from "@/components/Button";
import { Tag } from "@/components/Tag";
import { ConfirmButton } from "@/components/ConfirmButton";
import { listSupporters } from "@/lib/server/services/support";
import { addSupporterAction, removeSupporterAction } from "./actions";

export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  supporter: "Supporter",
  security: "Security",
  security_high: "Security (high)",
};

export default async function AdminSupportersPage() {
  const supporters = await listSupporters();

  return (
    <>
      <header className="mb-10">
        <p className="text-[13px] text-muted mb-2">Admin / Support</p>
        <h1 className="text-[32px] tracking-tight text-fg leading-none">Supporters</h1>
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
            message="This grants supporter access (private threads, replying, claiming). Promote to a security role from the roster."
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
                <div className="text-fg truncate flex items-center gap-2">
                  {s.firstName} <span className="text-muted">@{s.username}</span>
                  <Tag tone={s.role === "supporter" ? "neutral" : "info"}>
                    {ROLE_LABEL[s.role] ?? s.role}
                  </Tag>
                </div>
                <div className="text-[12px] text-muted">added {s.createdAt.slice(0, 10)}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <form action={addSupporterAction} className="flex items-center gap-1.5">
                  <input type="hidden" name="username" value={s.username} />
                  <select
                    name="role"
                    defaultValue={s.role}
                    className="h-8 rounded-md bg-card border border-rule px-2 text-[12px] text-fg focus:outline-none focus:border-accent"
                  >
                    <option value="supporter">Supporter</option>
                    <option value="security">Security</option>
                    <option value="security_high">Security (high)</option>
                  </select>
                  <Button type="submit" size="sm" variant="secondary">
                    Set role
                  </Button>
                </form>
                <ConfirmButton
                  action={removeSupporterAction}
                  fields={{ userId: s.userId }}
                  label="Remove"
                  triggerVariant="danger"
                  tone="danger"
                  title={`Remove @${s.username}?`}
                  message="They lose supporter and security access."
                  confirmLabel="Remove supporter"
                />
              </div>
            </div>
          ))
        )}
      </Section>
    </>
  );
}
