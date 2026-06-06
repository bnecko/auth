"use client";

import { useActionState } from "react";
import { Field } from "./Field";
import { Button } from "./Button";
import { Alert } from "./Alert";
import type { ChangePasswordState } from "@/app/security/actions";

export function ChangePasswordForm({
  action,
}: {
  action: (state: ChangePasswordState, formData: FormData) => Promise<ChangePasswordState>;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-4 max-w-sm py-2">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && (
        <Alert tone="success">
          Password changed. Your other sessions were signed out.
        </Alert>
      )}
      <Field
        label="current password"
        name="currentPassword"
        type="password"
        autoComplete="current-password"
        required
      />
      <Field
        label="new password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        minLength={10}
        maxLength={256}
        hint="10-256 characters"
        required
      />
      <div>
        <Button type="submit" loading={pending}>
          change password
        </Button>
      </div>
    </form>
  );
}
