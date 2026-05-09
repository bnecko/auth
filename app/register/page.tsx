"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Field } from "@/components/Field";
import { Button } from "@/components/Button";
import { Alert } from "@/components/Alert";
import { TurnstileField } from "@/components/TurnstileField";

type FieldErrors = Partial<{
  firstName: string;
  username: string;
  email: string;
  dob: string;
  password: string;
  form: string;
}>;

export default function RegisterPage() {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErrors({});
    setLoading(true);

    const formData = new FormData(e.currentTarget);
    if (formData.has("turnstileToken") && !formData.get("turnstileToken")) {
      setErrors({ form: "Please wait for the security check to finish." });
      setLoading(false);
      return;
    }

    const response = await fetch("/api/auth/register", {
      method: "POST",
      body: formData,
    });
    const data = (await response.json()) as {
      redirectTo?: string;
      verificationId?: string;
      botUrl?: string;
      error?: string;
      errors?: FieldErrors;
    };

    setLoading(false);

    if (!response.ok && response.status !== 202) {
      setErrors(data.errors || { form: data.error || "registration failed" });
      return;
    }

    if (response.status === 202 && data.verificationId && data.botUrl) {
      sessionStorage.setItem(
        `bn_telegram_bot_url_${data.verificationId}`,
        data.botUrl,
      );
      window.location.href = `/verify?id=${encodeURIComponent(data.verificationId)}`;
      return;
    }

    window.location.href = data.redirectTo || "/";
  }

  return (
    <AuthShell tag="auth/register">
      <h1 className="text-[22px] tracking-tightest text-fg mb-1">
        create account
      </h1>
      <p className="text-meta text-muted mb-5">
        telegram verification is required to complete sign-up.
      </p>

      {errors.form && (
        <div className="mb-4">
          <Alert tone="danger">{errors.form}</Alert>
        </div>
      )}

      <form className="space-y-4" onSubmit={onSubmit} noValidate>
        <Field
          label="first name"
          name="first_name"
          autoComplete="given-name"
          error={errors.firstName}
          required
        />
        <Field
          label="username"
          name="username"
          autoComplete="username"
          error={errors.username}
          required
        />
        <Field label="bio" name="bio" hint="shown publicly." optional />
        <Field
          label="email"
          name="email"
          type="email"
          autoComplete="email"
          error={errors.email}
          required
        />
        <Field
          label="date of birth"
          name="dob"
          type="date"
          hint="may be shared with external apps when you approve them."
          error={errors.dob}
          optional
        />
        <Field
          label="password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          required
        />
        <TurnstileField />
        <Button type="submit" loading={loading}>
          verify with telegram and complete
        </Button>
      </form>

      <p className="text-meta text-secondary mt-4">
        already have an account?{" "}
        <Link
          href="/login"
          className="text-fg hover:underline transition-colors"
        >
          sign in instead
        </Link>
      </p>
    </AuthShell>
  );
}
