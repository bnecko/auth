"use client";

import { useActionState } from "react";
import { PasswordField } from "./PasswordField";
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
    <form action={formAction} className="flex flex-col gap-4 max-w-md px-4 py-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.success && (
        <Alert tone="success">
          Password changed. Your other sessions were signed out.
        </Alert>
      )}
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        fillOnRequest
        required
      />
      <PasswordField
        label="New password"
        name="newPassword"
        autoComplete="new-password"
        minLength={10}
        maxLength={256}
        hint="10-256 characters"
        required
      />
      <div>
        <Button type="submit" size="sm" loading={pending}>
          Change password
        </Button>
      </div>
    </form>
  );
}
