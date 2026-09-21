"use client";

import { useActionState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { Field } from "@/components/Field";
import type { ContributeState } from "./actions";

export function ContributeForm({
  action,
  submission,
  balance,
}: {
  action: (state: ContributeState, formData: FormData) => Promise<ContributeState>;
  submission: string;
  balance: string;
}) {
  const [state, formAction, pending] = useActionState<ContributeState, FormData>(action, null);

  return (
    <form action={formAction} className="flex flex-col gap-3 px-4 py-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      {state?.donated && <Alert tone="success">{state.donated} btGRAM added to the pool. Thank you.</Alert>}
      <p className="text-[13px] text-secondary">
        A contribution moves btGRAM from your balance into the pool. It is a gift: it cannot be
        taken back or withdrawn afterwards. You have {balance} btGRAM.
      </p>
      <input type="hidden" name="submission" value={submission} />
      <Field
        label="Amount"
        name="amount"
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.5"
        hint="In btGRAM"
        required
      />
      <div>
        <Button type="submit" size="sm" loading={pending}>
          Contribute
        </Button>
      </div>
    </form>
  );
}
