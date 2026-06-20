"use client";

import { useState } from "react";
import type { SupportThreadRevision } from "@/lib/server/repositories/support";

// Public edit history: anyone who can view the thread can see what changed.
export function SupportEditHistory({ revisions }: { revisions: SupportThreadRevision[] }) {
  const [open, setOpen] = useState(false);
  if (revisions.length === 0) return null;

  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="text-[12px] text-muted hover:text-fg transition-colors"
      >
        Edited {revisions.length} time{revisions.length === 1 ? "" : "s"} ·{" "}
        {open ? "hide history" : "show history"}
      </button>
      {open && (
        <div className="mt-2 space-y-2">
          {revisions.map(rev => (
            <div
              key={rev.publicId}
              className="rounded-lg ring-1 ring-rule bg-elevated px-3 py-2.5 text-[12px]"
            >
              <div className="text-muted mb-1.5">
                @{rev.editorUsername} · {rev.createdAt.slice(0, 16).replace("T", " ")}
              </div>
              {rev.titleBefore !== rev.titleAfter && (
                <div className="mb-1">
                  <span className="text-faint">title:</span>{" "}
                  <span className="text-muted line-through">{rev.titleBefore}</span>{" "}
                  <span className="text-fg">{rev.titleAfter}</span>
                </div>
              )}
              {rev.bodyBefore !== rev.bodyAfter && (
                <div className="grid sm:grid-cols-2 gap-2">
                  <div className="text-muted whitespace-pre-wrap line-through">
                    {rev.bodyBefore}
                  </div>
                  <div className="text-fg whitespace-pre-wrap">{rev.bodyAfter}</div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
