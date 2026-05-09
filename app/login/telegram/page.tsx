"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";

type Status = "waiting" | "completed" | "failed";

function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function TelegramLoginPage() {
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [botUrl, setBotUrl] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id") || "";
    setChallengeId(id);
    if (id) {
      setBotUrl(sessionStorage.getItem(`bn_login_bot_url_${id}`) || "");
    }
  }, []);

  async function complete(id: string) {
    const response = await fetch(`/api/auth/login/challenges/${id}/complete`, {
      method: "POST",
    });
    const data = (await response.json()) as { redirectTo?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "verification failed");
      setStatus("failed");
      return;
    }

    setStatus("completed");
    sessionStorage.removeItem(`bn_login_bot_url_${id}`);
    const next = sessionStorage.getItem(`bn_login_next_${id}`);
    sessionStorage.removeItem(`bn_login_next_${id}`);
    window.location.href = safeNext(next || data.redirectTo);
  }

  async function checkStatus() {
    if (!challengeId) {
      return;
    }

    const response = await fetch(`/api/auth/login/challenges/${challengeId}`);
    const data = (await response.json()) as { status?: string; error?: string };

    if (!response.ok) {
      setError(data.error || "verification failed");
      setStatus("failed");
      return;
    }

    if (data.status === "verified") {
      await complete(challengeId);
    }

    if (data.status === "expired") {
      setError("verification expired. sign in again.");
      setStatus("failed");
    }
  }

  useEffect(() => {
    if (status !== "waiting" || !challengeId) return;
    const poll = setInterval(() => {
      checkStatus();
    }, 2500);
    return () => clearInterval(poll);
  }, [challengeId, status]);

  return (
    <AuthShell tag="auth/2fa">
      <h1 className="text-[22px] tracking-tightest text-fg mb-1">
        verify login
      </h1>
      <p className="text-meta text-muted mb-5">
        open Telegram from the same account linked to this Bottleneck account.
      </p>

      <div className="bg-bg border border-border rounded-sm p-4 mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-micro uppercase text-faint">telegram 2fa</span>
          <span className="text-meta text-muted">required</span>
        </div>
        <p className="text-[13px] text-secondary mt-2">
          The bot receives a one-time login token and confirms it belongs to
          your linked Telegram account.
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
            verification link missing. sign in again.
          </Alert>
        </div>
      )}

      <div className="flex items-center justify-center gap-2 text-meta text-muted my-4">
        <span className="animate-pulse">|</span>
        <span>waiting for telegram</span>
      </div>

      {error && <Alert tone="danger">{error}</Alert>}
      {status === "completed" && (
        <Alert tone="success">verified. redirecting.</Alert>
      )}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          variant="ghost"
          type="button"
          onClick={() => window.location.assign("/login")}
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
