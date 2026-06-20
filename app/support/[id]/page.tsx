import Link from "next/link";
import { notFound } from "next/navigation";
import { Star, Lock, ArrowLeft } from "lucide-react";
import { Tag } from "@/components/Tag";
import { Button } from "@/components/Button";
import { getCurrentSession } from "@/lib/server/session";
import { getThreadView } from "@/lib/server/services/support";
import { kindTone, statusTone, statusLabel } from "@/lib/supportDisplay";
import {
  claimAction,
  inviteAction,
  replyAction,
  starAction,
  statusAction,
  unclaimAction,
} from "../actions";

export const dynamic = "force-dynamic";

const textareaClass =
  "w-full rounded-md bg-card border border-rule px-3 py-2 text-[14px] text-fg " +
  "placeholder:text-faint focus:outline-none focus:border-accent focus:ring-2 " +
  "focus:ring-accent/25 transition";

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const current = await getCurrentSession();
  const view = await getThreadView({
    threadPublicId: id,
    viewer: current?.user ?? null,
  });
  if (!view) notFound();

  const { thread, access, messages, supporters, starred } = view;

  return (
    <>
      <Link
        href="/support"
        className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg transition-colors mb-5"
      >
        <ArrowLeft size={14} /> All threads
      </Link>

      <header className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Tag tone={kindTone(thread.kind)}>{thread.kind}</Tag>
          <Tag tone={statusTone(thread.status)}>{statusLabel(thread.status)}</Tag>
          {thread.visibility === "private" && (
            <span className="inline-flex items-center gap-1 text-[12px] text-muted">
              <Lock size={12} /> Private
            </span>
          )}
          {thread.visibility === "public" &&
            (access.canStar ? (
              <form action={starAction} className="ml-auto">
                <input type="hidden" name="threadId" value={thread.publicId} />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-rule text-[13px] text-secondary hover:bg-hover hover:text-fg transition-colors"
                >
                  <Star
                    size={14}
                    className={starred ? "fill-current text-accent-strong" : "text-faint"}
                  />
                  {thread.starCount}
                </button>
              </form>
            ) : (
              <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted tabular-nums">
                <Star size={14} className="text-faint" /> {thread.starCount}
              </span>
            ))}
        </div>
        <h1 className="text-[24px] tracking-tight text-fg leading-snug mb-1">
          {thread.title}
        </h1>
        <p className="text-[12px] text-muted">
          @{thread.authorUsername} · {thread.createdAt.slice(0, 10)}
        </p>
      </header>

      <div className="rounded-xl ring-1 ring-rule bg-card px-4 py-4 mb-5">
        <div className="text-[14px] text-fg whitespace-pre-wrap leading-relaxed">
          {thread.body}
        </div>
      </div>

      {(access.canClaim || access.canManage) && (
        <div className="rounded-xl ring-1 ring-rule bg-elevated p-3 mb-5">
          {thread.claimedByUsername && (
            <p className="text-[12px] text-muted mb-2 px-0.5">
              Claimed by @{thread.claimedByUsername}
              {supporters.length > 0 && (
                <> · supporting: {supporters.map(s => `@${s.username}`).join(", ")}</>
              )}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            {access.canClaim && (
              <form action={claimAction}>
                <input type="hidden" name="threadId" value={thread.publicId} />
                <Button type="submit" size="sm">
                  Claim ticket
                </Button>
              </form>
            )}
            {access.canManage && (
              <>
                {thread.status !== "resolved" && (
                  <form action={statusAction}>
                    <input type="hidden" name="threadId" value={thread.publicId} />
                    <input type="hidden" name="status" value="resolved" />
                    <Button type="submit" size="sm" variant="secondary">
                      Mark resolved
                    </Button>
                  </form>
                )}
                {thread.status !== "closed" && (
                  <form action={statusAction}>
                    <input type="hidden" name="threadId" value={thread.publicId} />
                    <input type="hidden" name="status" value="closed" />
                    <Button type="submit" size="sm" variant="secondary">
                      Close
                    </Button>
                  </form>
                )}
                {(thread.status === "resolved" || thread.status === "closed") && (
                  <form action={statusAction}>
                    <input type="hidden" name="threadId" value={thread.publicId} />
                    <input type="hidden" name="status" value="open" />
                    <Button type="submit" size="sm" variant="ghost">
                      Reopen
                    </Button>
                  </form>
                )}
                {thread.claimedByUserId !== null && (
                  <form action={unclaimAction}>
                    <input type="hidden" name="threadId" value={thread.publicId} />
                    <Button type="submit" size="sm" variant="ghost">
                      Unclaim
                    </Button>
                  </form>
                )}
                <form action={inviteAction} className="flex items-center gap-2 ml-auto">
                  <input type="hidden" name="threadId" value={thread.publicId} />
                  <input
                    name="username"
                    required
                    placeholder="invite supporter"
                    className="h-8 w-[160px] rounded-md bg-card border border-rule px-2.5 text-[13px] text-fg placeholder:text-faint focus:outline-none focus:border-accent transition-colors"
                  />
                  <Button type="submit" size="sm" variant="secondary">
                    Invite
                  </Button>
                </form>
              </>
            )}
          </div>
        </div>
      )}

      <section className="space-y-3 mb-6">
        {messages.length === 0 ? (
          <p className="text-[13px] text-muted px-0.5">No replies yet.</p>
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

      {access.canComment ? (
        <form
          action={replyAction}
          className="rounded-xl ring-1 ring-rule bg-card p-4 space-y-3"
        >
          <input type="hidden" name="threadId" value={thread.publicId} />
          <textarea
            name="body"
            required
            maxLength={4000}
            rows={4}
            placeholder="Write a reply…"
            className={textareaClass}
          />
          <div className="flex items-center justify-between gap-3">
            {access.canInternalNote && (
              <label className="flex items-center gap-2 text-[13px] text-muted">
                <input type="checkbox" name="internal" />
                Internal note (supporters only)
              </label>
            )}
            <Button type="submit" size="sm" className="ml-auto">
              Reply
            </Button>
          </div>
        </form>
      ) : (
        !current && (
          <div className="rounded-xl ring-1 ring-rule bg-card px-4 py-4 text-[13px] text-muted">
            <Link
              href={`/login?next=/support/${thread.publicId}`}
              className="text-accent-strong hover:underline"
            >
              Sign in
            </Link>{" "}
            to reply
            {thread.visibility === "public" && " or star this thread"}.
          </div>
        )
      )}
    </>
  );
}
