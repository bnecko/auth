"use client";

import Link from "next/link";
import { useState } from "react";
import { Empty, Row, RowLabel, RowValue, Section } from "@/components/Section";
import { Tag } from "@/components/Tag";
import { Glyph } from "@/components/Glyph";
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
      hint="keys for external apps"
      index="3.1"
      action={
        <Link
          href="/request-bearer"
          className="text-meta uppercase tracking-wider text-secondary hover:text-accent transition-colors flex items-baseline gap-1.5"
        >
          <Glyph kind="ok" />
          <span>request bearer</span>
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
      setError("clipboard unavailable");
    }
  }

  async function abandon() {
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
        <div className="border-t border-rule first:border-t-0 px-1 py-2.5 flex items-baseline gap-2 text-meta">
          <Glyph kind="warn" />
          <span className="text-accent">
            this is the only time the key will be shown. copy it now.
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
                  "text-[12px] truncate flex-1 px-2 py-1 border border-rule bg-bg-soft",
                  revealed ? "text-accent" : "text-faint blur-[3px] select-none",
                ].join(" ")}
                title={revealed ? "your bearer key" : "click show to reveal"}
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
              <Glyph kind="dot" />
              <span className="text-muted text-meta">
                {shortDate(bearer.createdAt)}
              </span>
            </span>
          )}
        </RowValue>
        <span className="flex items-center gap-3 text-meta uppercase tracking-wider">
          {error && <span className="text-danger normal-case">{error}</span>}
          {canReveal && !hasKey && (
            <>
              <button
                type="button"
                onClick={reveal}
                disabled={busy}
                className="text-secondary hover:text-accent transition-colors disabled:text-faint"
              >
                show
              </button>
              <button
                type="button"
                onClick={abandon}
                disabled={busy}
                className="text-faint hover:text-danger transition-colors disabled:text-faint"
              >
                discard
              </button>
            </>
          )}
          {hasKey && (
            <>
              <button
                type="button"
                onClick={copy}
                className="text-secondary hover:text-accent transition-colors"
              >
                {copied ? "copied" : "copy"}
              </button>
              <button
                type="button"
                onClick={() => setRevealed(null)}
                className="text-secondary hover:text-fg transition-colors"
              >
                done
              </button>
            </>
          )}
        </span>
      </Row>
    </>
  );
}
