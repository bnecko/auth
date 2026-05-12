"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Cursor } from "@/components/Glyph";

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
      <h1 className="text-[28px] tracking-tightest text-fg mb-1 leading-none">
        verify with telegram
      </h1>
      <p className="text-meta text-muted mb-7">
        open the bot to finish signing up
      </p>

      <div className="border-t border-rule">
        <div className="flex items-baseline justify-between py-2.5">
          <span className="text-meta uppercase tracking-wider text-muted">
            channel
          </span>
          <span className="text-meta text-fg">telegram</span>
        </div>
        <div className="flex items-baseline justify-between py-2.5 border-t border-rule">
          <span className="text-meta uppercase tracking-wider text-muted">
            expires in
          </span>
          <span className="text-meta text-accent tabular-nums">
            {Math.floor(secondsLeft / 60)}:
            {(secondsLeft % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <div className="border-t border-rule" />
      </div>

      <p className="text-meta text-secondary mt-3 mb-5">
        the button opens telegram with a one-time start token attached.
      </p>

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
            verification link missing — start registration again
          </Alert>
        </div>
      )}

      {status === "waiting" && (
        <div className="flex items-baseline gap-2 text-meta uppercase tracking-wider text-muted my-5">
          <Cursor />
          <span>waiting for verification</span>
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {status === "completed" && (
        <Alert tone="success">verified — redirecting</Alert>
      )}

      <div className="mt-6 grid grid-cols-2 gap-3">
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
