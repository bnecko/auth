"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/Button";
import { PasswordField } from "@/components/PasswordField";
import type { UnlinkState } from "./actions";

export function UnlinkWalletForm({
  action,
}: {
  action: (state: UnlinkState, formData: FormData) => Promise<UnlinkState>;
}) {
  const [state, formAction, pending] = useActionState<UnlinkState, FormData>(action, null);
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <div className="px-4 py-3 border-t border-rule">
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)}>
          Unlink wallet
        </Button>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-3 px-4 py-4 border-t border-rule">
      <p className="text-[13px] text-secondary">
        Withdrawals are paid to this wallet, so removing it needs your password.
      </p>
      <PasswordField
        label="Current password"
        name="currentPassword"
        autoComplete="current-password"
        fillOnRequest
        required
        error={state?.error}
      />
      <div className="flex gap-2">
        <Button type="submit" variant="danger" size="sm" loading={pending}>
          Unlink wallet
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Keep it
        </Button>
      </div>
    </form>
  );
}
