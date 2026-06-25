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
  acceptTerms: string;
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
    if (!formData.get("accept_terms")) {
      setErrors({ acceptTerms: "You must accept the Terms, Privacy Policy, and Rules to continue." });
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
      <h1 className="text-[28px] tracking-tight text-fg mb-1 leading-none">
        Create account
      </h1>
      <p className="text-[13px] text-muted mb-7">
        Telegram verification is required to complete sign-up
      </p>

      {errors.form && (
        <div className="mb-5">
          <Alert tone="danger">{errors.form}</Alert>
        </div>
      )}

      <form className="space-y-5" onSubmit={onSubmit} noValidate>
        <Field
          label="First name"
          name="first_name"
          autoComplete="given-name"
          error={errors.firstName}
          required
        />
        <Field
          label="Username"
          name="username"
          autoComplete="username"
          error={errors.username}
          required
        />
        <Field label="Bio" name="bio" hint="Shown publicly" optional />
        <Field
          label="Email"
          name="email"
          type="email"
          autoComplete="email"
          error={errors.email}
          required
        />
        <Field
          label="Date of birth"
          name="dob"
          type="date"
          hint="May be shared with apps when you approve them"
          error={errors.dob}
          optional
        />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          error={errors.password}
          required
        />
        <TurnstileField />
        <label className="flex items-start gap-2.5 text-[13px] text-secondary">
          <input
            type="checkbox"
            name="accept_terms"
            value="true"
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-rule accent-[var(--accent)]"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="text-accent-strong hover:text-fg transition-colors">Terms of Service</Link>,{" "}
            <Link href="/privacy" target="_blank" className="text-accent-strong hover:text-fg transition-colors">Privacy Policy</Link>, and{" "}
            <Link href="/rules" target="_blank" className="text-accent-strong hover:text-fg transition-colors">Rules</Link>, and confirm the details above are accurate.
          </span>
        </label>
        {errors.acceptTerms && (
          <p className="text-[12px] text-danger -mt-2">{errors.acceptTerms}</p>
        )}
        <Button type="submit" loading={loading}>
          Verify with Telegram
        </Button>
      </form>

      <p className="text-[13px] text-muted mt-5">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-accent-strong hover:text-fg transition-colors"
        >
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
