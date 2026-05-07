"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Divider } from "@/components/Divider";
import { Alert } from "@/components/Alert";

export default function LoginPage() {
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      body: new FormData(e.currentTarget),
    });
    const data = (await response.json()) as {
      redirectTo?: string;
      error?: string;
      errors?: Record<string, string>;
    };

    setLoading(false);

    if (!response.ok) {
      setError(data.error || data.errors?.form || "login failed");
      return;
    }

    const params = new URLSearchParams(window.location.search);
    window.location.href = params.get("next") || data.redirectTo || "/";
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

      <Button variant="secondary" type="button">
        continue with telegram
      </Button>
    </AuthShell>
  );
}
