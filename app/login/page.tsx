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
      <h1 className="text-[28px] text-fg mb-1 leading-none">
        Sign in
      </h1>
      <p className="text-[13px] text-muted mb-7">
        Access your bottleneck account
      </p>

      {error && (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      )}

      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <Field
          label="Email or username"
          name="identifier"
          type="text"
          autoComplete="username"
          placeholder="alex@example.com"
          required
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          required
        />
        <label className="flex items-baseline gap-3 cursor-pointer select-none group">
          <input
            type="checkbox"
            name="remember"
            defaultChecked
            className="appearance-none w-4 h-4 border border-rule bg-transparent checked:bg-accent checked:border-accent transition-colors shrink-0 translate-y-0.5 rounded-md"
          />
          <span className="text-[13px] text-muted group-hover:text-fg transition-colors">
            Remember this device
          </span>
        </label>
        <TurnstileField />
        <Button type="submit" loading={loading}>
          Continue
        </Button>
      </form>

      <div className="flex justify-between mt-5 text-[13px]">
        <Link
          href="/register"
          className="text-secondary hover:text-accent-strong transition-colors"
        >
          Create account
        </Link>
        <Link
          href="/forgot"
          className="text-secondary hover:text-accent-strong transition-colors"
        >
          Forgot password
        </Link>
      </div>

      <div className="my-6">
        <Divider label="or" />
      </div>

      <div className="space-y-3">
        <Button
          variant="secondary"
          type="button"
          onClick={onPasskeyLogin}
          loading={loading}
        >
          Continue with passkey
        </Button>
        <Button variant="secondary" type="button">
          Continue with Telegram
        </Button>
      </div>
    </AuthShell>
  );
}
