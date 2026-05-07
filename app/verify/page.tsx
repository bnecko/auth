"use client";

import { useEffect, useMemo, useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";

type Status = "waiting" | "verified" | "completed" | "failed";

export default function VerifyPage() {
  const [status, setStatus] = useState<Status>("waiting");
  const [error, setError] = useState("");
  const [secondsLeft, setSecondsLeft] = useState(180);
  const [query, setQuery] = useState({ id: "", code: "" });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery({
      id: params.get("id") || "",
      code: params.get("code") || "",
    });
  }, []);

  const botUrl = useMemo(() => {
    const username =
      process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || "bottleneck_auth_bot";
    return `https://t.me/${username}?start=${encodeURIComponent(query.code)}`;
  }, [query.code]);

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
    window.location.href = data.redirectTo || "/";
  }

  async function checkStatus() {
    if (!query.id) {
      return;
    }

    const response = await fetch(`/api/telegram/verification/${query.id}`);
    const data = (await response.json()) as { status?: string; error?: string };

    if (!response.ok) {
      setError(data.error || "verification failed");
      setStatus("failed");
      return;
    }

    if (data.status === "verified") {
      setStatus("verified");
      await complete(query.id);
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
    if (status !== "waiting" || !query.id) return;
    const poll = setInterval(() => {
      checkStatus();
    }, 2500);
    return () => clearInterval(poll);
  }, [query.id, status]);

  return (
    <AuthShell tag="auth/verify">
      <h1 className="text-[22px] tracking-tightest text-fg mb-1">
        verify with telegram
      </h1>
      <p className="text-meta text-muted mb-5">
        open the bot and send the code below to finish signing up.
      </p>

      <div className="bg-bg border border-border rounded-sm p-4 mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-micro uppercase text-faint">code</span>
          <span className="text-meta text-muted tabular-nums">
            expires in {Math.floor(secondsLeft / 60)}:
            {(secondsLeft % 60).toString().padStart(2, "0")}
          </span>
        </div>
        <div className="text-fg font-mono text-[20px] tracking-[0.15em] mt-2 select-all">
          {query.code || "missing code"}
        </div>
      </div>

      <a
        href={botUrl}
        target="_blank"
        rel="noreferrer"
        className="block mb-3"
      >
        <Button type="button" disabled={!query.code}>
          open telegram bot
        </Button>
      </a>

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
