"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/Button";
import { ConfirmDialog } from "@/components/ConfirmDialog";
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
        <Link href="/request-bearer">
          <Button variant="secondary" size="sm">Request bearer</Button>
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
  const [confirmKind, setConfirmKind] = useState<null | "reveal" | "discard" | "revoke">(null);
  const [revokeToken, setRevokeToken] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(bearer.status === "revoked");
  const [revokeNote, setRevokeNote] = useState<string | null>(null);

  // After kicking off a revoke, poll until the creator approves/denies in
  // Telegram (mirrors the relink polling).
  useEffect(() => {
    if (!revokeToken || revoked) return;
    const interval = setInterval(async () => {
      const res = await fetch(
        `/api/bearer-requests/${bearer.publicId}/revoke/status?t=${encodeURIComponent(revokeToken)}`,
      );
      const data = (await res.json()) as { status?: string };
      if (data.status === "revoked") {
        setRevoked(true);
        setHasPlaintext(false);
        setRevokeToken(null);
      } else if (data.status === "denied" || data.status === "expired") {
        setRevokeNote(
          data.status === "denied" ? "Revocation denied in Telegram." : "Revocation request expired.",
        );
        setRevokeToken(null);
      }
    }, 2500);
    return () => clearInterval(interval);
  }, [revokeToken, revoked, bearer.publicId]);

  async function startRevoke() {
    setBusy(true);
    setError(null);
    setRevokeNote(null);
    try {
      const res = await fetch(`/api/bearer-requests/${bearer.publicId}/revoke`, {
        method: "POST",
      });
      const data = (await res.json()) as { browserToken?: string; error?: string };
      if (!res.ok || !data.browserToken) {
        setError(data.error || "Could not start revoke");
        return;
      }
      setRevokeToken(data.browserToken);
      setRevokeNote("Approve the revoke in Telegram.");
    } finally {
      setBusy(false);
      setConfirmKind(null);
    }
  }

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
      setConfirmKind(null);
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
      setConfirmKind(null);
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
          {revoked && <Tag tone="neutral">Revoked</Tag>}
          {revokeNote && !revoked && <span className="text-muted">{revokeNote}</span>}
          {error && <span className="text-danger">{error}</span>}
          {!revoked && canReveal && !hasKey && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={() => setConfirmKind("reveal")} disabled={busy}>
                Show
              </Button>
              <Button type="button" variant="danger" size="sm" onClick={() => setConfirmKind("discard")} disabled={busy}>
                Discard
              </Button>
            </>
          )}
          {hasKey && (
            <>
              <Button type="button" variant="secondary" size="sm" onClick={copy}>
                {copied ? "Copied" : "Copy"}
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => setRevealed(null)}>
                Done
              </Button>
            </>
          )}
          {!revoked && !hasKey && bearer.status === "approved" && !revokeToken && (
            <Button type="button" variant="danger" size="sm" onClick={() => setConfirmKind("revoke")} disabled={busy}>
              Revoke
            </Button>
          )}
        </span>
      </Row>
      <ConfirmDialog
        open={confirmKind !== null}
        busy={busy}
        tone={confirmKind === "reveal" ? "warning" : "danger"}
        title={
          confirmKind === "discard"
            ? "Clear this key?"
            : confirmKind === "revoke"
              ? "Revoke this key?"
              : "Reveal this key?"
        }
        message={
          confirmKind === "discard"
            ? "The saved key is cleared and cannot be viewed again."
            : confirmKind === "revoke"
              ? "This sends a confirmation to your Telegram. Once you approve there, the key is permanently revoked and apps using it stop working."
              : "The key is shown only once - copy it immediately, it cannot be retrieved later."
        }
        confirmLabel={
          confirmKind === "discard"
            ? "Clear key"
            : confirmKind === "revoke"
              ? "Send Telegram confirmation"
              : "Reveal"
        }
        onConfirm={() =>
          confirmKind === "discard"
            ? abandon()
            : confirmKind === "revoke"
              ? startRevoke()
              : reveal()
        }
        onClose={() => !busy && setConfirmKind(null)}
      />
    </>
  );
}
