"use client";

import { Suspense, useActionState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthShell } from "@/components/AuthShell";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import { resetPasswordAction } from "./actions";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const [state, formAction, pending] = useActionState(
    async (prevState: any, formData: FormData) => {
      return await resetPasswordAction(formData);
    },
    null
  );

  if (!token) {
    return (
      <AuthShell tag="auth/reset">
        <Alert tone="danger">Missing reset token.</Alert>
        <Link href="/forgot" className="block mt-4">
          <Button variant="ghost">request new link</Button>
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell tag="auth/reset">
      <h1 className="text-[24px] tracking-tightest text-fg mb-1">
        set new password
      </h1>
      <p className="text-meta text-muted mb-5">
        enter your new password below.
      </p>

      {state?.error && (
        <div className="mb-4">
          <Alert tone="danger">{state.error}</Alert>
        </div>
      )}

      {state?.success ? (
        <div className="mb-4">
          <Alert tone="success">
            Password has been successfully reset!
          </Alert>
          <Link href="/login" className="block mt-4">
            <Button>sign in now</Button>
          </Link>
        </div>
      ) : (
        <form action={formAction}>
          <input type="hidden" name="token" value={token} />
          
          <div className="mb-5">
            <Field
              label="New Password"
              name="password"
              type="password"
              required
              autoComplete="new-password"
            />
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? "saving..." : "reset password"}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell tag="auth/reset"><p>Loading...</p></AuthShell>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
