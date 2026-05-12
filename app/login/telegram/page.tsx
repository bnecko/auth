"use client";

import { useEffect, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { Cursor } from "@/components/Glyph";

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
      <h1 className="text-[28px] tracking-tightest text-fg mb-1 leading-none">
        verify login
      </h1>
      <p className="text-meta text-muted mb-7">
        open telegram from the same account linked to bottleneck
      </p>

      <div className="border-t border-rule">
        <div className="flex items-baseline justify-between py-2.5">
          <span className="text-meta uppercase tracking-wider text-muted">
            channel
          </span>
          <span className="text-meta text-fg">telegram 2fa</span>
        </div>
        <div className="flex items-baseline justify-between py-2.5 border-t border-rule">
          <span className="text-meta uppercase tracking-wider text-muted">
            status
          </span>
          <span className="text-meta text-accent">required</span>
        </div>
        <div className="border-t border-rule" />
      </div>

      <p className="text-meta text-secondary mt-3 mb-5">
        the bot receives a one-time login token and confirms it belongs to your
        linked telegram account.
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
          <Alert tone="warning">verification link missing — sign in again</Alert>
        </div>
      )}

      {status === "waiting" && (
        <div className="flex items-baseline gap-2 text-meta uppercase tracking-wider text-muted my-5">
          <Cursor />
          <span>waiting for telegram</span>
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
