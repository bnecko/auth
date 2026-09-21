"use client";

import { useActionState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import type { VerifyState } from "./actions";

export function VerifyIdentityForm({
  action,
  label,
}: {
  action: () => Promise<VerifyState>;
  label: string;
}) {
  // The action redirects to the provider on success, so the only state that
  // ever comes back here is a failure to get that far.
  const [state, formAction, pending] = useActionState<VerifyState>(
    async () => action(),
    null,
  );

  return (
    <form action={formAction} className="flex flex-col gap-3 px-4 py-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <p className="text-[13px] text-secondary">
        Withdrawing requires a verified identity. You will be taken to our verification partner,
        who checks your document and tells us only whether you passed. Your document is not
        stored here.
      </p>
      <div>
        <Button type="submit" size="sm" loading={pending}>
          {label}
        </Button>
      </div>
    </form>
  );
}
