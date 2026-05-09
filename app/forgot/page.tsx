"use client";

import Link from "next/link";
import { useActionState } from "react";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { requestPasswordReset } from "./actions";

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(
    async (prevState: any, formData: FormData) => {
      const res = await requestPasswordReset(formData);
      return res;
    },
    null
  );

  return (
    <AuthShell tag="auth/recovery">
      <h1 className="text-[22px] tracking-tightest text-fg mb-1">
        recover access
      </h1>
      <p className="text-meta text-muted mb-5">
        enter your username or email and we will send a reset link to your linked Telegram account.
      </p>

      {state?.error && (
        <div className="mb-4">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      )}

      {state?.success ? (
        <div className="mb-4">
          <Alert tone="success">
            If an account with that identifier exists and has a linked Telegram, a reset link has been sent.
          </Alert>
          <Link href="/login" className="block mt-4">
            <Button variant="ghost" type="button">
              return to sign in
            </Button>
          </Link>
        </div>
      ) : (
        <form action={formAction}>
          <div className="mb-5">
            <Field
              label="Username or Email"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              placeholder="e.g. alice or alice@example.com"
            />
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "sending..." : "send reset link"}
          </Button>

          <Link href="/login" className="block mt-3">
            <Button variant="ghost" type="button">
              return to sign in
            </Button>
          </Link>
        </form>
      )}
    </AuthShell>
  );
}
