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
    return "issued";
  }
  return b.status;
}

function shortDate(value: string | null) {
  if (!value) return "never";
  return value.slice(0, 10);
}

export function BearerSection({ bearers }: { bearers: BearerRequest[] }) {
  return (
    <Section
      title="api bearers"
      hint="// keys for external apps"
      action={
        <Link
          href="/request-bearer"
          className="text-meta text-secondary hover:text-fg transition-colors"
        >
          request bearer
        </Link>
      }
    >
      {bearers.length === 0 ? (
        <Empty>no bearer requests</Empty>
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
        setError(data.error || "could not reveal key");
        return;
      }
      setRevealed(data.key);
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
      setError("clipboard unavailable");
    }
  }

  async function dismiss() {
    if (!confirm("clear the saved key? you won't be able to view it again.")) {
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
        setError(data.error || "could not clear key");
        return;
      }
      setRevealed(null);
      setHasPlaintext(false);
    } finally {
      setBusy(false);
    }
  }

  const showReveal = bearer.status === "approved" && hasPlaintext;
  const masked = revealed
    ? revealed
    : "•".repeat(48);

  return (
    <Row>
      <RowLabel>{bearer.appName}</RowLabel>
      <RowValue>
        {showReveal ? (
          <span className="flex items-center gap-2 min-w-0 flex-1">
            <code
              className={[
                "text-[12px] truncate flex-1 px-2 py-1 rounded-sm border border-border bg-bg",
                revealed ? "text-fg" : "text-faint blur-[3px] select-none",
              ].join(" ")}
              title={revealed ? "your bearer key" : "click show to reveal"}
            >
              {masked}
            </code>
            <Tag tone="success" bracket={false}>
              {statusLabel(bearer)}
            </Tag>
          </span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="text-secondary truncate max-w-[260px]">
              {bearer.reason}
            </span>
            <Tag tone={statusTone(bearer.status)} bracket={false}>
              {statusLabel(bearer)}
            </Tag>
            <span className="text-faint">/</span>
            <span className="text-muted text-meta">
              {shortDate(bearer.createdAt)}
            </span>
          </span>
        )}
      </RowValue>
      <span className="flex items-center gap-3 text-meta">
        {error && <span className="text-danger">{error}</span>}
        {showReveal && !revealed && (
          <button
            type="button"
            onClick={reveal}
            disabled={busy}
            className="text-secondary hover:text-fg transition-colors disabled:text-faint"
          >
            show
          </button>
        )}
        {showReveal && revealed && (
          <>
            <button
              type="button"
              onClick={copy}
              className="text-secondary hover:text-fg transition-colors"
            >
              {copied ? "copied" : "copy"}
            </button>
            <button
              type="button"
              onClick={() => setRevealed(null)}
              className="text-secondary hover:text-fg transition-colors"
            >
              hide
            </button>
            <button
              type="button"
              onClick={dismiss}
              disabled={busy}
              className="text-danger hover:text-danger/80 transition-colors disabled:text-faint"
            >
              i saved it
            </button>
          </>
        )}
      </span>
    </Row>
  );
}
