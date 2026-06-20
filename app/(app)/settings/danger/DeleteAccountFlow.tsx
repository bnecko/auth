"use client";

import { useEffect, useRef, useState } from "react";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";

type Phase = "idle" | "awaiting" | "scheduled" | "denied" | "error";

export function DeleteAccountFlow({ hasTelegram }: { hasTelegram: boolean }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const tokenRef = useRef("");

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = (await res.json()) as { browserToken?: string; error?: string };
    setSubmitting(false);
    if (!res.ok || !data.browserToken) {
      setError(data.error || "Could not start deletion.");
      return;
    }
    tokenRef.current = data.browserToken;
    setPassword("");
    setPhase("awaiting");
  }

  useEffect(() => {
    if (phase !== "awaiting") return;
    const poll = setInterval(async () => {
      const res = await fetch(
        `/api/account/delete/status?t=${encodeURIComponent(tokenRef.current)}`,
      );
      const data = (await res.json()) as { status?: string };
      if (data.status === "scheduled") setPhase("scheduled");
      else if (data.status === "denied") setPhase("denied");
      else if (data.status === "expired") {
        setError("This request expired. Start again.");
        setPhase("error");
      }
    }, 2500);
    return () => clearInterval(poll);
  }, [phase]);

  if (phase === "scheduled") {
    return (
      <div className="px-4 py-4">
        <Alert tone="warning">
          Your account is scheduled for deletion in 30 days. You&apos;ve been signed out
          everywhere. Sign in any time within 30 days to cancel it - after that the account
          and its data are permanently removed.
        </Alert>
      </div>
    );
  }

  if (phase === "awaiting") {
    return (
      <div className="px-4 py-4 space-y-3">
        <Alert tone="info">
          Check Telegram and tap <span className="text-fg font-medium">Approve deletion</span>{" "}
          to confirm. Waiting for your approval…
        </Alert>
        <Button variant="ghost" size="sm" type="button" onClick={() => setPhase("idle")}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={start} className="px-4 py-4 space-y-4 max-w-md">
      {phase === "denied" && (
        <Alert tone="danger">Deletion was denied in Telegram.</Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      {!hasTelegram ? (
        <Alert tone="info">Link Telegram before you can delete your account.</Alert>
      ) : (
        <>
          <p className="text-[13px] text-muted">
            Deletion needs Telegram approval and your current password. Your account is then
            scheduled for removal in 30 days; signing in before then cancels it.
          </p>
          <Field
            label="Current password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />
          <Button
            type="submit"
            size="sm"
            variant="danger"
            loading={submitting}
            disabled={!password}
          >
            Request account deletion
          </Button>
        </>
      )}
    </form>
  );
}
