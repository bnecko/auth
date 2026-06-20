import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/server/session";
import { getRestrictedView } from "@/lib/server/services/restrictions";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { restrictedReplyAction } from "./actions";

export const dynamic = "force-dynamic";

const textareaClass =
  "w-full rounded-md bg-card border border-rule px-3 py-2 text-[14px] text-fg " +
  "placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 " +
  "focus:ring-accent/25 transition";

export default async function RestrictedPage() {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!current.user.restricted) redirect("/");

  const view = await getRestrictedView(current.user);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[24px] tracking-tight text-fg leading-none mb-2">
          Your account is restricted
        </h1>
        <p className="text-[13px] text-muted">
          Access is paused pending a security review. Talk to the security team below.
        </p>
      </header>

      {!view ? (
        <Alert tone="warning">
          Your account is restricted. Please contact support.
        </Alert>
      ) : (
        <>
          <div className="rounded-xl ring-1 ring-rule bg-card px-4 py-4 mb-5">
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-[13px] text-muted">Reference code</span>
              <code className="text-[13px] text-accent-strong">
                {view.restriction.triggerCode}
              </code>
            </div>
            <div className="flex items-baseline justify-between gap-3 mb-2">
              <span className="text-[13px] text-muted">Restricted on</span>
              <span className="text-[13px] text-fg tabular-nums">
                {view.restriction.createdAt.slice(0, 10)}
              </span>
            </div>
            {view.restriction.reason && (
              <div className="text-[13px] text-secondary border-t border-rule pt-2 mt-2 whitespace-pre-wrap">
                {view.restriction.reason}
              </div>
            )}
          </div>

          <section className="space-y-3 mb-5">
            {view.messages.length === 0 ? (
              <p className="text-[13px] text-muted px-0.5">
                No messages yet. Send one below to reach the security team.
              </p>
            ) : (
              view.messages.map(m => (
                <div key={m.publicId} className="rounded-lg ring-1 ring-rule bg-card px-4 py-3">
                  <div className="flex items-center gap-2 mb-1 text-[12px] text-muted">
                    <span className="text-secondary">@{m.authorUsername}</span>
                    <span>·</span>
                    <span className="tabular-nums">
                      {m.createdAt.slice(0, 16).replace("T", " ")}
                    </span>
                  </div>
                  <div className="text-[14px] text-fg whitespace-pre-wrap leading-relaxed">
                    {m.body}
                  </div>
                </div>
              ))
            )}
          </section>

          <form
            action={restrictedReplyAction}
            className="rounded-xl ring-1 ring-rule bg-card p-4 space-y-3"
          >
            <textarea
              name="body"
              required
              maxLength={4000}
              rows={4}
              placeholder="Message the security team…"
              className={textareaClass}
            />
            <Button type="submit" size="sm">
              Send message
            </Button>
          </form>
        </>
      )}
    </>
  );
}
