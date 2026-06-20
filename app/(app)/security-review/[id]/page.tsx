import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentSession } from "@/lib/server/session";
import { canHandleSecurity, canRestrict } from "@/lib/server/supporterAuth";
import { getRestrictionForReview } from "@/lib/server/services/restrictions";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
import { ConfirmButton } from "@/components/ConfirmButton";
import { liftRestrictionAction, securityReplyAction } from "../actions";

export const dynamic = "force-dynamic";

const textareaClass =
  "w-full rounded-md bg-card border border-rule px-3 py-2 text-[14px] text-fg " +
  "placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 " +
  "focus:ring-accent/25 transition";

export default async function RestrictionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const current = await getCurrentSession();
  if (!current) redirect("/login");
  if (!(await canHandleSecurity(current.user))) redirect("/");
  const mayRestrict = await canRestrict(current.user);

  const { id } = await params;
  const view = await getRestrictionForReview(id);
  if (!view) notFound();

  const { restriction, messages } = view;

  return (
    <>
      <Link
        href="/security-review"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg transition-colors mb-5"
      >
        <ArrowLeft size={14} /> Security review
      </Link>

      <header className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Tag tone="danger">{restriction.triggerType}</Tag>
          <code className="text-[12px] text-muted">{restriction.triggerCode}</code>
          <span className="text-faint tabular-nums">{restriction.createdAt.slice(0, 10)}</span>
          {mayRestrict && (
            <span className="ml-auto">
              <ConfirmButton
                action={liftRestrictionAction}
                fields={{ restrictionId: restriction.publicId }}
                label="Lift restriction"
                triggerVariant="secondary"
                tone="warning"
                title="Lift this restriction?"
                message="The account regains full access immediately."
                confirmLabel="Lift restriction"
              />
            </span>
          )}
        </div>
        <h1 className="text-[22px] tracking-tight text-fg leading-snug">
          @{restriction.username}
        </h1>
        {restriction.reason && (
          <p className="text-[13px] text-secondary mt-1 whitespace-pre-wrap">
            {restriction.reason}
          </p>
        )}
      </header>

      <section className="space-y-3 mb-5">
        {messages.length === 0 ? (
          <p className="text-[13px] text-muted px-0.5">No messages yet.</p>
        ) : (
          messages.map(m => (
            <div
              key={m.publicId}
              className={`rounded-lg ring-1 px-4 py-3 ${
                m.internal ? "ring-[#f1d28a] bg-[#fff6e0]/50" : "ring-rule bg-card"
              }`}
            >
              <div className="flex items-center gap-2 mb-1 text-[12px] text-muted">
                <span className="text-secondary">@{m.authorUsername}</span>
                <span>·</span>
                <span className="tabular-nums">
                  {m.createdAt.slice(0, 16).replace("T", " ")}
                </span>
                {m.internal && <Tag tone="warning">internal note</Tag>}
              </div>
              <div className="text-[14px] text-fg whitespace-pre-wrap leading-relaxed">
                {m.body}
              </div>
            </div>
          ))
        )}
      </section>

      <form action={securityReplyAction} className="rounded-xl ring-1 ring-rule bg-card p-4 space-y-3">
        <input type="hidden" name="restrictionId" value={restriction.publicId} />
        <textarea
          name="body"
          required
          maxLength={4000}
          rows={4}
          placeholder="Reply to the user…"
          className={textareaClass}
        />
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-[13px] text-muted">
            <input type="checkbox" name="internal" />
            Internal note (security team only)
          </label>
          <Button type="submit" size="sm">
            Send
          </Button>
        </div>
      </form>
    </>
  );
}
