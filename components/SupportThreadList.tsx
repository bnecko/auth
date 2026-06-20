import Link from "next/link";
import { Star, Lock } from "lucide-react";
import { Tag } from "@/components/Tag";
import { kindTone, statusTone, statusLabel } from "@/lib/supportDisplay";
import type { SupportThread } from "@/lib/server/repositories/support";

// Shared row list for the public board, "my threads", and the supporter queue.
export function SupportThreadList({
  threads,
  empty,
}: {
  threads: SupportThread[];
  empty: string;
}) {
  if (threads.length === 0) {
    return (
      <div className="rounded-xl ring-1 ring-rule bg-card px-4 py-12 text-center text-[13px] text-muted">
        {empty}
      </div>
    );
  }

  return (
    <ul className="rounded-xl ring-1 ring-rule bg-card overflow-hidden">
      {threads.map(t => (
        <li key={t.publicId}>
          <Link
            href={`/support/${t.publicId}`}
            className="block px-4 py-3.5 border-t border-rule first:border-t-0 hover:bg-hover transition-colors"
          >
            <div className="flex items-center gap-2 mb-1">
              <Tag tone={kindTone(t.kind)}>{t.kind}</Tag>
              <Tag tone={statusTone(t.status)}>{statusLabel(t.status)}</Tag>
              {t.visibility === "private" && (
                <span className="inline-flex items-center gap-1 text-[12px] text-muted">
                  <Lock size={11} /> private
                </span>
              )}
              {t.claimedByUsername && (
                <span className="text-[12px] text-muted truncate">
                  claimed by @{t.claimedByUsername}
                </span>
              )}
              <span className="ml-auto inline-flex items-center gap-1 text-[12px] text-muted tabular-nums shrink-0">
                <Star size={13} className="text-faint" /> {t.starCount}
              </span>
            </div>
            <div className="text-[14px] text-fg truncate">{t.title}</div>
            <div className="text-[12px] text-muted mt-0.5">
              @{t.authorUsername} · {t.createdAt.slice(0, 10)}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
