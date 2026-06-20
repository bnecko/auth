"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { Alert } from "@/components/Alert";

type Status = "waiting" | "code" | "completed" | "failed";

function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function TelegramLoginPage() {
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setChallengeId(params.get("id") || "");
  }, []);

  async function submitCode(e: React.FormEvent) {
    e.preventDefault();
    if (!challengeId) return;
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/auth/login/challenges/${challengeId}/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = (await response.json()) as { redirectTo?: string; error?: string };
    setSubmitting(false);
    if (!response.ok) {
      setError(data.error || "Incorrect code. Check Telegram and try again.");
      return;
    }
    setStatus("completed");
    const next = sessionStorage.getItem(`bn_login_next_${challengeId}`);
    sessionStorage.removeItem(`bn_login_next_${challengeId}`);
    window.location.href = safeNext(next || data.redirectTo);
  }

  async function checkStatus() {
    if (!challengeId) return;
    const response = await fetch(`/api/auth/login/challenges/${challengeId}`);
    const data = (await response.json()) as { status?: string };
    if (data.status === "approved") {
      setStatus(prev => (prev === "waiting" ? "code" : prev));
    } else if (data.status === "expired" || data.status === "unknown") {
      setError("This sign-in request expired. Sign in again.");
      setStatus("failed");
    } else if (data.status === "cancelled") {
      setError("This sign-in was declined in Telegram.");
      setStatus("failed");
    }
  }

  // Poll only while waiting for the Telegram tap; stop once the code step opens.
  useEffect(() => {
    if (status !== "waiting" || !challengeId) return;
    const poll = setInterval(checkStatus, 2500);
    return () => clearInterval(poll);
  }, [challengeId, status]);

  return (
    <AuthShell tag="auth/2fa">
      <h1 className="text-[28px] text-fg mb-1 leading-none">Confirm it&apos;s you</h1>
      <p className="text-meta text-muted mb-7">
        We sent a sign-in request to your Telegram
      </p>

      {status === "waiting" && (
        <>
          <div className="bg-card border border-rule rounded-lg px-4 py-3 mb-5 text-[13px] text-secondary leading-relaxed">
            Open Telegram and tap <span className="text-fg font-medium">Log in</span> on the
            request from the bottleneck bot. We&apos;ll then ask for the 6-digit code it sends
            you.
          </div>
          <p className="text-[13px] text-muted my-5">Waiting for your Telegram tap…</p>
        </>
      )}

      {status === "code" && (
        <form onSubmit={submitCode} className="space-y-5">
          <Alert tone="success">
            Approved in Telegram. Enter the 6-digit code we just sent you.
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
            Verify and sign in
          </Button>
        </form>
      )}

      {status === "completed" && <Alert tone="success">Verified - redirecting</Alert>}

      {status === "failed" && (
        <>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="mt-6">
            <Button
              variant="ghost"
              type="button"
              onClick={() => window.location.assign("/login")}
            >
              Back to sign in
            </Button>
          </div>
        </>
      )}

      {status === "waiting" && (
        <div className="mt-6 grid grid-cols-2 gap-3">
          <Button
            variant="ghost"
            type="button"
            onClick={() => window.location.assign("/login")}
          >
            Start over
          </Button>
          <Button variant="ghost" type="button" onClick={checkStatus}>
            Check status
          </Button>
        </div>
      )}
    </AuthShell>
  );
}
