"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, Row, RowLabel, RowValue, Section } from "@/components/Section";
import { Tag } from "@/components/Tag";
import type { BearerRequest } from "@/lib/server/types";

type Tone = "neutral" | "success" | "danger" | "warning";

function statusTone(status: BearerRequest["status"]): Tone {
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  if (status === "cleared") return "neutral";
  return "warning";
}

function statusLabel(b: BearerRequest) {
  if (b.status === "approved" && !b.hasPlaintext) {
    return "Issued";
  }
  return b.status.charAt(0).toUpperCase() + b.status.slice(1);
}

function shortDate(value: string | null) {
  if (!value) return "never";
  return value.slice(0, 10);
}

export function BearerSection({ bearers }: { bearers: BearerRequest[] }) {
  return (
    <Section
      title="API bearers"
      hint="Keys for external apps"
      index="3.1"
      action={
        <Link
          href="/request-bearer"
          className="text-[13px] text-secondary hover:text-accent-strong transition-colors"
        >
          Request bearer
        </Link>
      }
    >
      {bearers.length === 0 ? (
        <Empty>No bearer requests</Empty>
      ) : (
        bearers.map(bearer => <BearerRow key={bearer.publicId} bearer={bearer} />)
      )}
    </Section>
  );
}

function BearerRow({ bearer }: { bearer: BearerRequest }) {
  const [revealed, setRevealed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasPlaintext, setHasPlaintext] = useState(bearer.hasPlaintext);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/bearer-requests/${bearer.publicId}/reveal`,
        { method: "POST" },
      );
      const data = (await response.json()) as { key?: string; error?: string };
      if (!response.ok || !data.key) {
        setError(data.error || "Could not reveal key");
        return;
      }
      setRevealed(data.key);
      setHasPlaintext(false);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!revealed) return;
    try {
      await navigator.clipboard.writeText(revealed);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Clipboard unavailable");
    }
  }

  async function abandon() {
    if (!confirm("Clear the saved key? You won't be able to view it again.")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/bearer-requests/${bearer.publicId}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(data.error || "Could not clear key");
        return;
      }
      setHasPlaintext(false);
    } finally {
      setBusy(false);
    }
  }

  const canReveal = bearer.status === "approved" && hasPlaintext;
  const hasKey = revealed !== null;
  const masked = revealed ? revealed : "•".repeat(48);
  const inKeyMode = canReveal || hasKey;

  return (
    <>
      {hasKey && (
        <div className="border-t border-rule first:border-t-0 px-1 py-2.5 flex items-center gap-2 text-[13px]">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
          <span className="text-accent-strong">
            This is the only time the key will be shown. Copy it now.
          </span>
        </div>
      )}
      <Row>
        <RowLabel>{bearer.appName}</RowLabel>
        <RowValue>
          {inKeyMode ? (
            <span className="flex items-center gap-2 min-w-0 flex-1">
              <code
                className={[
                  "text-[12px] truncate flex-1 px-2 py-1 border border-rule bg-bg-soft rounded-md",
                  revealed ? "text-accent-strong" : "text-faint blur-[3px] select-none",
                ].join(" ")}
                title={revealed ? "Your bearer key" : "Click show to reveal"}
              >
                {masked}
              </code>
              <Tag tone="success">{statusLabel(bearer)}</Tag>
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <span className="text-secondary truncate max-w-[260px]">
                {bearer.reason}
              </span>
              <Tag tone={statusTone(bearer.status)}>{statusLabel(bearer)}</Tag>
              <span className="text-[13px] text-muted">
                {shortDate(bearer.createdAt)}
              </span>
            </span>
          )}
        </RowValue>
        <span className="flex items-center gap-3 text-[13px]">
          {error && <span className="text-danger">{error}</span>}
          {canReveal && !hasKey && (
            <>
              <button
                type="button"
                onClick={reveal}
                disabled={busy}
                className="text-secondary hover:text-accent-strong transition-colors disabled:text-faint"
              >
                Show
              </button>
              <button
                type="button"
                onClick={abandon}
                disabled={busy}
                className="text-faint hover:text-danger transition-colors disabled:text-faint"
              >
                Discard
              </button>
            </>
          )}
          {hasKey && (
            <>
              <button
                type="button"
                onClick={copy}
                className="text-secondary hover:text-accent-strong transition-colors"
              >
                {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="text-secondary hover:text-fg transition-colors"
              >
                Done
              </button>
            </>
          )}
        </span>
      </Row>
    </>
  );
}
