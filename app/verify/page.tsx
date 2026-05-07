"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";

type Status = "waiting" | "completed" | "failed";

export default function VerifyPage() {
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [verificationId, setVerificationId] = useState("");
  const [botUrl, setBotUrl] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "";
    setVerificationId(id);
    if (id) {
      setBotUrl(sessionStorage.getItem(`bn_telegram_bot_url_${id}`) || "");
    }
  }, []);

  async function complete(id: string) {
    const response = await fetch(`/api/telegram/verification/${id}/complete`, {
      method: "POST",
    });
    const data = (await response.json()) as { redirectTo?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "registration failed");
      setStatus("failed");
      return;
    }

    setStatus("completed");
    sessionStorage.removeItem(`bn_telegram_bot_url_${id}`);
    window.location.href = data.redirectTo || "/";
  }

  async function checkStatus() {
    if (!verificationId) {
      return;
    }

    const response = await fetch(`/api/telegram/verification/${verificationId}`);
    const data = (await response.json()) as { status?: string; error?: string };

    if (!response.ok) {
      setError(data.error || "verification failed");
      setStatus("failed");
      return;
    }

    if (data.status === "verified") {
      await complete(verificationId);
    }
  }

  useEffect(() => {
    if (status !== "waiting") return;
    const tick = setInterval(() => {
      setSecondsLeft(s => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [status]);

  useEffect(() => {
    if (status !== "waiting" || !verificationId) return;
    const poll = setInterval(() => {
      checkStatus();
    }, 2500);
    return () => clearInterval(poll);
  }, [verificationId, status]);

  return (
    <AuthShell tag="auth/verify">
      <h1 className="text-[22px] tracking-tightest text-fg mb-1">
        verify with telegram
      </h1>
      <p className="text-meta text-muted mb-5">
        open the bot to finish signing up.
      </p>

      <div className="bg-bg border border-border rounded-sm p-4 mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-micro uppercase text-faint">telegram</span>
          <span className="text-meta text-muted tabular-nums">
            expires in {Math.floor(secondsLeft / 60)}:
            {(secondsLeft % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <p className="text-[13px] text-secondary mt-2">
          The button opens Telegram with a one-time start token attached.
        </p>
      </div>

      <a
        href={botUrl || undefined}
        target="_blank"
        rel="noreferrer"
        className="block mb-3"
      >
        <Button type="button" disabled={!botUrl}>
          open telegram bot
        </Button>
      </a>

      {!botUrl && (
        <div className="mb-4">
          <Alert tone="warning">
            verification link missing. start registration again.
          </Alert>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-meta text-muted my-4">
        <span className="animate-pulse">|</span>
        <span>waiting for verification</span>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {status === "completed" && (
        <Alert tone="success">verified. redirecting.</Alert>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() => window.location.assign("/register")}
        >
          start over
        </Button>
        <Button variant="ghost" type="button" onClick={checkStatus}>
          check status
        </Button>
      </div>
    </AuthShell>
  );
}
