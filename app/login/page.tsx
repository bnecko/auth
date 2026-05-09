"use client";

import Link from "next/link";
import { useState } from "react";
import { startAuthentication } from "@simplewebauthn/browser";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Divider } from "@/components/Divider";
import { Alert } from "@/components/Alert";
import { TurnstileField } from "@/components/TurnstileField";

function safeNext(value: string | null | undefined) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    if (formData.has("turnstileToken") && !formData.get("turnstileToken")) {
      setError("Please wait for the security check to finish.");
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/login", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as {
      redirectTo?: string;
      requiresTelegram?: boolean;
      challengeId?: string;
      botUrl?: string;
      error?: string;
      errors?: Record<string, string>;
    };

    setLoading(false);

    if (!response.ok) {
      setError(data.error || data.errors?.form || "login failed");
      return;
    }

    if (response.status === 202 && data.requiresTelegram && data.challengeId) {
      const params = new URLSearchParams(window.location.search);
      if (data.botUrl) {
        sessionStorage.setItem(
          `bn_login_bot_url_${data.challengeId}`,
          data.botUrl,
        );
      }
      sessionStorage.setItem(
        `bn_login_next_${data.challengeId}`,
        safeNext(params.get("next") || data.redirectTo),
      );
      window.location.href = `/login/telegram?id=${encodeURIComponent(data.challengeId)}`;
      return;
    }

    const params = new URLSearchParams(window.location.search);
    window.location.href = safeNext(params.get("next") || data.redirectTo);
  }

  async function onPasskeyLogin() {
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/webauthn/login/generate-options");
      if (!res.ok) throw new Error("Failed to initialize passkey login");
      const { options, challengeId } = await res.json();

      const asseResp = await startAuthentication({ optionsJSON: options });

      const verifyRes = await fetch("/api/auth/webauthn/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ response: asseResp, challengeId }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) {
        throw new Error(verifyData.error || "Passkey verification failed");
      }

      const params = new URLSearchParams(window.location.search);
      window.location.href = safeNext(params.get("next") || verifyData.redirectTo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey login failed");
      setLoading(false);
    }
  }

  return (
    <AuthShell tag="auth/sign-in">
      <h1 className="text-[22px] tracking-tightest text-fg mb-1">sign in</h1>
      <p className="text-meta text-muted mb-5">
        access your bottleneck account.
      </p>

      {error && (
        <div className="mb-4">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <form className="space-y-4 mt-4" onSubmit={onSubmit} noValidate>
        <Field
          label="email or username"
          name="identifier"
          type="text"
          autoComplete="username"
          placeholder="alex@example.com"
          required
        />
        <Field
          label="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="password"
          required
        />
        <label className="flex items-center justify-between gap-3 border border-border bg-bg rounded-sm px-3 py-2.5 cursor-pointer">
          <span>
            <span className="block text-[13px] text-fg">remember me</span>
            <span className="block text-meta text-muted">
              keep this browser signed in.
            </span>
          </span>
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="rounded-sm border-border bg-transparent focus:ring-1 focus:ring-border accent-fg"
          />
        </label>
        <TurnstileField />
        <Button type="submit" loading={loading}>
          continue
        </Button>
      </form>

      <div className="flex justify-between mt-4 text-meta">
        <Link
          href="/register"
          className="text-secondary hover:text-fg transition-colors"
        >
          create account
        </Link>
        <Link
          href="/forgot"
          className="text-secondary hover:text-fg transition-colors"
        >
          forgot password
        </Link>
      </div>

      <div className="my-6">
        <Divider label="or" />
      </div>

      <div className="space-y-3">
        <Button variant="secondary" type="button" onClick={onPasskeyLogin} loading={loading}>
          continue with passkey
        </Button>
        <Button variant="secondary" type="button">
          continue with telegram
        </Button>
      </div>
    </AuthShell>
  );
}
