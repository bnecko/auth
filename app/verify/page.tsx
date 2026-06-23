"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Alert } from "@/components/Alert";

type Status = "waiting" | "code" | "completed" | "failed";

export default function VerifyPage() {
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [verificationId, setVerificationId] = useState("");
  const [botUrl, setBotUrl] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "";
    setVerificationId(id);
    if (id) {
      setBotUrl(sessionStorage.getItem(`bn_telegram_bot_url_${id}`) || "");
    }
  }, []);

  // Telegram approved -> send the email code and move to the code step. Guarded
  // so the transition (and the send) happens once.
  async function startCodeStep(id: string) {
    setStatus("code");
    await fetch(`/api/telegram/verification/${id}/send-code`, { method: "POST" });
  }

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!verificationId) return;
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/telegram/verification/${verificationId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = (await response.json()) as { redirectTo?: string; error?: string };
    setSubmitting(false);
    if (!response.ok) {
      setError(data.error || "Incorrect code. Check your email and try again.");
      return;
    }
    setStatus("completed");
    sessionStorage.removeItem(`bn_telegram_bot_url_${verificationId}`);
    window.location.href = data.redirectTo || "/account";
  }

  async function resendCode() {
    if (!verificationId) return;
    setError("");
    await fetch(`/api/telegram/verification/${verificationId}/send-code`, { method: "POST" });
  }

  async function checkStatus() {
    if (!verificationId) return;
    const response = await fetch(`/api/telegram/verification/${verificationId}`);
    const data = (await response.json()) as { status?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "verification failed");
      setStatus("failed");
      return;
    }
    if (data.status === "verified") {
      await startCodeStep(verificationId);
    } else if (data.status === "cancelled") {
      setError("This sign-up was denied in Telegram. Start over to try again.");
      setStatus("failed");
    }
  }

  useEffect(() => {
    if (status !== "waiting") return;
    const tick = setInterval(() => setSecondsLeft(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(tick);
  }, [status]);

  useEffect(() => {
    if (status !== "waiting" || !verificationId) return;
    const poll = setInterval(() => checkStatus(), 2500);
    return () => clearInterval(poll);
  }, [verificationId, status]);

  return (
    <AuthShell tag="auth/verify">
      <h1 className="text-[28px] text-fg mb-1 leading-none">Finish signing up</h1>
      <p className="text-meta text-muted mb-7">
        {status === "code"
          ? "Enter the code we emailed you"
          : "Open the bot and tap Approve, then confirm your email"}
      </p>

      {status === "waiting" && (
        <>
          <div className="border-t border-rule">
            <div className="flex items-baseline justify-between py-2.5">
              <span className="text-[13px] text-muted">Channel</span>
              <span className="text-meta text-fg">Telegram</span>
            </div>
            <div className="flex items-baseline justify-between py-2.5 border-t border-rule">
              <span className="text-[13px] text-muted">Expires in</span>
              <span className="text-meta text-accent-strong tabular-nums">
                {Math.floor(secondsLeft / 60)}:
                {(secondsLeft % 60).toString().padStart(2, "0")}
              </span>
            </div>
            <div className="border-t border-rule" />
          </div>

          <p className="text-meta text-secondary mt-3 mb-5">
            The button opens Telegram with a one-time start token attached.
          </p>

          <a href={botUrl || undefined} target="_blank" rel="noreferrer" className="block mb-3">
            <Button type="button" disabled={!botUrl}>
              Open Telegram bot
            </Button>
          </a>

          {!botUrl && (
            <div className="mb-4">
              <Alert tone="warning">Verification link missing - start registration again</Alert>
            </div>
          )}

          <p className="text-[13px] text-muted my-5">Waiting for verification…</p>

          <div className="mt-6 grid grid-cols-2 gap-3">
            <Button variant="ghost" type="button" onClick={() => window.location.assign("/register")}>
              Start over
            </Button>
            <Button variant="ghost" type="button" onClick={checkStatus}>
              Check status
            </Button>
          </div>
        </>
      )}

      {status === "code" && (
        <form onSubmit={submitCode} className="space-y-5">
          <Alert tone="success">
            Approved in Telegram. Enter the 6-digit code we emailed you to finish.
          </Alert>
          <Field
            label="6-digit code"
            name="code"
            value={code}
            onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="123456"
            required
          />
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" loading={submitting} disabled={code.length !== 6}>
            Verify and finish
          </Button>
          <Button variant="ghost" type="button" onClick={resendCode}>
            Resend code
          </Button>
        </form>
      )}

      {status === "completed" && <Alert tone="success">Verified - redirecting</Alert>}

      {status === "failed" && (
        <>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="mt-6">
            <Button variant="ghost" type="button" onClick={() => window.location.assign("/register")}>
              Start over
            </Button>
          </div>
        </>
      )}
    </AuthShell>
  );
}
